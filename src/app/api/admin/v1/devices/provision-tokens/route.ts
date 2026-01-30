import crypto from "crypto";
import QRCode from "qrcode";
import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const BodySchema = z.object({
  expiresInMinutes: z.number().int().min(5).max(120).optional(),
});

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function randomToken(): string {
  // URL-safe-ish token
  return crypto.randomBytes(24).toString("base64url");
}

async function getDeviceLimitSnapshot(tenantId: string) {
  // Ensure entitlement row exists; default maxDevices=1
  const ent = await prisma.tenantEntitlement.upsert({
    where: { tenantId },
    create: { tenantId, validUntil: null, maxDevices: 1 },
    update: {},
    select: { maxDevices: true },
  });

  const activeDevices = await prisma.mobileDevice.count({
    where: { tenantId, status: "ACTIVE", apiKey: { status: "ACTIVE" } },
  });

  return { maxDevices: ent.maxDevices, activeDevices };
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAdminAuth(req);
    const body = await validateBody(req, BodySchema, 16 * 1024);

    const { maxDevices, activeDevices } = await getDeviceLimitSnapshot(ctx.tenantId);
    if (activeDevices >= maxDevices) {
      return jsonError(req, 402, "DEVICE_LIMIT_REACHED", "Maximale Anzahl Geräte erreicht.", {
        activeDevices,
        maxDevices,
      });
    }

    const minutes = body.expiresInMinutes ?? 30;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + minutes * 60_000);

    const token = randomToken();
    const tokenHash = sha256Hex(token);
    const prefix = token.slice(0, 6);

    await prisma.mobileProvisionToken.create({
      data: {
        tenantId: ctx.tenantId,
        prefix,
        tokenHash,
        status: "ACTIVE",
        expiresAt,
        createdByUserId: ctx.userId ?? null,
      },
      select: { id: true },
    });

    // QR encodes plain token (best for in-app scanner)
    const qrPngDataUrl = await QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 2, scale: 6 });

    return jsonOk(req, {
      token,
      expiresAt: expiresAt.toISOString(),
      claimUrl: token,
      qrPngDataUrl,
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
