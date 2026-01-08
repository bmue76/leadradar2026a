import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenantContext";
import { z } from "zod";
import crypto from "crypto";

export const runtime = "nodejs";

const CreateKeyBody = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  createDevice: z.boolean().optional(),
  deviceName: z.string().trim().min(1).max(120).optional(),
});

const PREFIX_LEN = 8;

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function generateToken(): string {
  return `lrk_${crypto.randomBytes(32).toString("base64url")}`;
}

function toKeyDto(k: {
  id: string;
  name: string;
  prefix: string;
  status: "ACTIVE" | "REVOKED";
  createdAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  device?: { id: string; name: string; status: "ACTIVE" | "DISABLED"; lastSeenAt: Date | null } | null;
}) {
  return {
    id: k.id,
    prefix: k.prefix,
    label: k.name,
    status: k.status,
    createdAt: k.createdAt.toISOString(),
    revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    device: k.device
      ? {
          id: k.device.id,
          name: k.device.name,
          status: k.device.status,
          lastSeenAt: k.device.lastSeenAt ? k.device.lastSeenAt.toISOString() : null,
        }
      : null,
  };
}

export async function GET(req: Request) {
  try {
    const { tenantId } = await requireTenantContext(req);

    const keys = await prisma.mobileApiKey.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        name: true,
        prefix: true,
        status: true,
        createdAt: true,
        revokedAt: true,
        lastUsedAt: true,
        device: {
          select: { id: true, name: true, status: true, lastSeenAt: true },
        },
      },
    });

    return jsonOk(req, { items: keys.map(toKeyDto) });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId } = await requireTenantContext(req);
    const body = await validateBody(req, CreateKeyBody);

    const token = generateToken();
    const prefix = token.slice(0, PREFIX_LEN);
    const keyHash = sha256Hex(token);

    const label = (body.label ?? "").trim() || "Mobile Key";
    const createDevice = body.createDevice !== false; // default true
    const deviceName = (body.deviceName ?? "").trim() || "New Device";

    const result = await prisma.$transaction(async (tx) => {
      const apiKey = await tx.mobileApiKey.create({
        data: {
          tenantId,
          name: label,
          prefix,
          keyHash,
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          prefix: true,
          status: true,
          createdAt: true,
          revokedAt: true,
          lastUsedAt: true,
        },
      });

      if (!createDevice) {
        return { apiKey, device: null as null };
      }

      const device = await tx.mobileDevice.create({
        data: {
          tenantId,
          name: deviceName,
          apiKeyId: apiKey.id,
          status: "ACTIVE",
        },
        select: { id: true, name: true, status: true, lastSeenAt: true },
      });

      return { apiKey, device };
    });

    const created = await prisma.mobileApiKey.findFirst({
      where: { id: result.apiKey.id, tenantId },
      select: {
        id: true,
        name: true,
        prefix: true,
        status: true,
        createdAt: true,
        revokedAt: true,
        lastUsedAt: true,
        device: { select: { id: true, name: true, status: true, lastSeenAt: true } },
      },
    });

    if (!created) throw httpError(500, "INTERNAL", "Key creation failed.");

    return jsonOk(req, {
      apiKey: toKeyDto(created),
      token, // one-time only
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
