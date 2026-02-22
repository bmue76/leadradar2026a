import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tenantSlug: z.string().min(1),
  code: z.string().min(4),
});

function traceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function jsonOk(data: unknown, tid: string): Response {
  return NextResponse.json({ ok: true, data, traceId: tid }, { status: 200, headers: { "x-trace-id": tid } });
}

function jsonError(code: string, message: string, tid: string, status = 400): Response {
  return NextResponse.json({ ok: false, error: { code, message }, traceId: tid }, { status, headers: { "x-trace-id": tid } });
}

async function validateBody(
  req: NextRequest,
  tid: string
): Promise<{ ok: true; data: z.infer<typeof BodySchema> } | { ok: false; res: Response }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false, res: jsonError("BAD_JSON", "Invalid JSON body.", tid, 400) };
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return { ok: false, res: jsonError("VALIDATION_ERROR", parsed.error.message, tid, 400) };
  return { ok: true, data: parsed.data };
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function genApiKey(): string {
  return `lr_live_${randomBytes(32).toString("base64url")}`;
}

/**
 * MVP: Provisioning uses a human-friendly SHORTCODE (e.g. "MVVJJ6GQ78").
 * Compatibility guard:
 * - Accept "lrp_..." prefixed codes (strip prefix)
 * - Accept full deep links (extract ?code=...)
 * - Case-insensitive (uppercase before hashing)
 */
function normalizeProvisioningCode(input: string): string {
  const raw = input.trim();

  // If user pasted a deep link, extract code param
  try {
    if (raw.includes("://") && raw.includes("code=")) {
      const u = new URL(raw);
      const c = u.searchParams.get("code");
      if (c && c.trim()) return c.trim().toUpperCase();
    }
  } catch {
    // ignore; fallback below
  }

  const lower = raw.toLowerCase();

  // Strip legacy prefixes (if any)
  if (lower.startsWith("lrp_")) return raw.slice(4).trim().toUpperCase();
  if (lower.startsWith("lrp")) return raw.slice(3).replace(/^_/, "").trim().toUpperCase();

  return raw.toUpperCase();
}

export async function POST(req: NextRequest): Promise<Response> {
  const tid = traceId();

  const body = await validateBody(req, tid);
  if (!body.ok) return body.res;

  const tenantSlug = body.data.tenantSlug.trim();
  const code = normalizeProvisioningCode(body.data.code);

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true },
  });

  // leak-safe: do not reveal tenant existence
  if (!tenant) return jsonError("INVALID_CODE", "Invalid provisioning code.", tid, 401);

  const tokenHash = sha256Hex(code);
  const now = new Date();

  const token = await prisma.mobileProvisionToken.findFirst({
    where: { tenantId: tenant.id, tokenHash, status: "ACTIVE", expiresAt: { gt: now } },
    select: { id: true, deviceId: true },
  });

  if (!token?.deviceId) return jsonError("INVALID_CODE", "Invalid provisioning code.", tid, 401);

  const device = await prisma.mobileDevice.findFirst({
    where: { id: token.deviceId, tenantId: tenant.id },
    select: { id: true, apiKeyId: true, name: true },
  });

  if (!device) return jsonError("INVALID_CODE", "Invalid provisioning code.", tid, 401);

  const apiKeyPlain = genApiKey();
  const apiKeyHash = sha256Hex(apiKeyPlain);
  const apiKeyPrefix = apiKeyPlain.slice(0, 14);

  await prisma.$transaction(async (tx) => {
    // Mark token USED and clear plaintext
    await tx.mobileProvisionToken.update({
      where: { id: token.id },
      data: {
        status: "USED",
        usedAt: new Date(),
        usedByDeviceId: device.id,
        tokenPlaintext: null,
      },
    });

    // Create new api key
    const newKey = await tx.mobileApiKey.create({
      data: {
        tenantId: tenant.id,
        name: `${device.name} (redeem)`,
        prefix: apiKeyPrefix,
        keyHash: apiKeyHash,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    // Revoke previous api key
    await tx.mobileApiKey.update({
      where: { id: device.apiKeyId },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    // Bind device to new api key
    await tx.mobileDevice.update({
      where: { id: device.id },
      data: { apiKeyId: newKey.id },
    });
  });

  return jsonOk({ apiKey: apiKeyPlain, tenantSlug: tenant.slug, deviceId: device.id }, tid);
}
