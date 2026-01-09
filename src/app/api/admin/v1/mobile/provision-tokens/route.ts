import { z } from "zod";
import { jsonOk, jsonError } from "@/lib/api";
import { validateBody, validateQuery, httpError, isHttpError } from "@/lib/http";
import { requireTenantContext } from "@/lib/tenantContext";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const runtime = "nodejs";

const CreateSchema = z.object({
  deviceName: z.string().trim().min(1).max(120).optional(),
  formIds: z.array(z.string().min(1)).max(200).optional(),
  expiresInMinutes: z.number().int().min(1).max(24 * 60).optional(),
});

const ListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

function getProvisionSecret(): string {
  const s = (process.env.MOBILE_PROVISION_TOKEN_SECRET || process.env.MOBILE_API_KEY_SECRET || "").trim();
  if (!s) throw httpError(500, "MISCONFIGURED", "Server misconfigured.");
  return s;
}

function hmacSha256Hex(secret: string, value: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function generatePrefix8(): string {
  // 6 bytes base64url => 8 chars
  return crypto.randomBytes(6).toString("base64url").slice(0, 8);
}

function generateProvisionToken(): { token: string; prefix: string; tokenHash: string } {
  const secret = getProvisionSecret();
  const prefix = generatePrefix8();
  // Make token body start with prefix (human-friendly), then add randomness.
  const body = `${prefix}${crypto.randomBytes(24).toString("base64url")}`;
  const token = `prov_${prefix}_${body}`;
  const tokenHash = hmacSha256Hex(secret, token);
  return { token, prefix, tokenHash };
}

function clampExpiresMinutes(raw?: number): number {
  const v = typeof raw === "number" && Number.isFinite(raw) ? raw : 30;
  // MVP clamp: 5..240 minutes
  return Math.max(5, Math.min(240, Math.floor(v)));
}

function effectiveStatus(row: { status: string; expiresAt: Date }, now: Date): string {
  const s = (row.status || "").toUpperCase();
  if (s === "ACTIVE" && row.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return s || "—";
}

export async function POST(req: Request): Promise<Response> {
  try {
    const { tenantId } = await requireTenantContext(req);
    const body = await validateBody(req, CreateSchema);

    const expiresMin = clampExpiresMinutes(body.expiresInMinutes);
    const expiresAt = new Date(Date.now() + expiresMin * 60_000);

    const requestedDeviceName = body.deviceName?.trim() || null;
    const requestedFormIds = Array.isArray(body.formIds) ? body.formIds.slice(0, 200) : [];

    // Collision extremely unlikely, but keep it robust.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { token, prefix, tokenHash } = generateProvisionToken();
      try {
        const row = await prisma.mobileProvisionToken.create({
          data: {
            tenantId,
            prefix,
            tokenHash,
            status: "ACTIVE",
            expiresAt,
            requestedDeviceName,
            requestedFormIds: requestedFormIds.length ? requestedFormIds : undefined,
          },
          select: { id: true, prefix: true, status: true, expiresAt: true, createdAt: true },
        });

        return jsonOk(
          req,
          {
            provision: {
              id: row.id,
              prefix: row.prefix,
              status: row.status,
              expiresAt: row.expiresAt,
              createdAt: row.createdAt,
            },
            token,
          },
          { status: 200 }
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // retry on unique collisions only (tokenHash unique)
        if (attempt < 2 && msg.toLowerCase().includes("unique")) continue;
        throw e;
      }
    }

    throw httpError(500, "INTERNAL_ERROR", "Internal server error.");
  } catch (e: unknown) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error("POST /api/admin/v1/mobile/provision-tokens failed", e);
    return jsonError(req, 500, "INTERNAL_ERROR", "Internal server error.");
  }
}

export async function GET(req: Request): Promise<Response> {
  try {
    const { tenantId } = await requireTenantContext(req);
    const q = await validateQuery(req, ListSchema);

    const limit = q.limit ?? 50;
    const cursor = (q.cursor || "").trim() || null;

    const rows = await prisma.mobileProvisionToken.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        prefix: true,
        status: true,
        expiresAt: true,
        usedAt: true,
        usedByDeviceId: true,
        createdAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

    const now = new Date();
    const items = page.map((r) => ({
      ...r,
      status: effectiveStatus({ status: r.status, expiresAt: r.expiresAt }, now),
    }));

    return jsonOk(req, { items, nextCursor });
  } catch (e: unknown) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error("GET /api/admin/v1/mobile/provision-tokens failed", e);
    return jsonError(req, 500, "INTERNAL_ERROR", "Internal server error.");
  }
}
