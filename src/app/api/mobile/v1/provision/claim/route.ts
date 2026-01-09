import { z } from "zod";
import crypto from "crypto";
import { jsonOk, jsonError } from "@/lib/api";
import { validateBody, httpError, isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * TP 3.1 Policy (strict / leak-safe):
 * - invalid/expired/revoked/used token => 401 INVALID_PROVISION_TOKEN
 * - rate limited => 429 RATE_LIMITED
 *
 * No tenant IDs / existence details are revealed.
 */

const ClaimSchema = z.object({
  token: z.string().trim().min(10).max(500),
  deviceName: z.string().trim().min(1).max(120).optional(),
});

function getProvisionSecret(): string {
  const s = (process.env.MOBILE_PROVISION_TOKEN_SECRET || process.env.MOBILE_API_KEY_SECRET || "").trim();
  if (!s) throw httpError(500, "MISCONFIGURED", "Server misconfigured.");
  return s;
}

function getMobileApiKeySecret(): string {
  const s = (process.env.MOBILE_API_KEY_SECRET || "").trim();
  if (!s) throw httpError(500, "MISCONFIGURED", "Server misconfigured.");
  return s;
}

function hmacSha256Hex(secret: string, value: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function safeInvalidToken(): never {
  // Strict, no details, no leaks.
  throw httpError(401, "INVALID_PROVISION_TOKEN", "Invalid provision token.");
}

function generateApiKeyToken(): { token: string; prefix: string; keyHash: string } {
  const secret = getMobileApiKeySecret();

  // Token format compatible with existing Mobile API keys: lrk_<8hex>_<random>
  const p = crypto.randomBytes(4).toString("hex"); // 8 hex
  const prefix = `lrk_${p}`;
  const body = crypto.randomBytes(24).toString("base64url");
  const token = `${prefix}_${body}`;
  const keyHash = hmacSha256Hex(secret, token);

  return { token, prefix, keyHash };
}

function jsonToStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const it of v) {
    if (typeof it === "string" && it.trim()) out.push(it.trim());
  }
  return out;
}

export async function POST(req: Request): Promise<Response> {
  try {
    // Best-effort abuse protection (Phase 1 / in-memory; not global across instances)
    const ip = getClientIp(req);
    enforceRateLimit(`prov_claim:ip:${ip}`, { limit: 10, windowSec: 60 });

    const body = await validateBody(req, ClaimSchema);
    const token = body.token.trim();

    // Hash incoming provision token (never store cleartext)
    const tokenHash = hmacSha256Hex(getProvisionSecret(), token);

    // Additional best-effort limiter per tokenHash prefix (covers brute-force + spam retries)
    enforceRateLimit(`prov_claim:tok:${tokenHash.slice(0, 12)}`, { limit: 10, windowSec: 60 });

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const prov = await tx.mobileProvisionToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          tenantId: true,
          status: true,
          expiresAt: true,
          usedAt: true,
          requestedDeviceName: true,
          requestedFormIds: true,
        },
      });

      if (!prov) safeInvalidToken();

      // Single-use enforcement (race-safe): exactly one request can flip ACTIVE -> USED.
      const locked = await tx.mobileProvisionToken.updateMany({
        where: {
          tokenHash,
          status: "ACTIVE",
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { status: "USED", usedAt: now },
      });

      if (locked.count !== 1) safeInvalidToken();

      const deviceName = (body.deviceName?.trim() || prov.requestedDeviceName?.trim() || "Mobile Device").slice(0, 120);

      // Create api key + device (same transaction)
      const apiKeyGen = generateApiKeyToken();

      const apiKey = await tx.mobileApiKey.create({
        data: {
          tenantId: prov.tenantId,
          name: deviceName,
          prefix: apiKeyGen.prefix,
          keyHash: apiKeyGen.keyHash,
          status: "ACTIVE",
        },
        select: { id: true, prefix: true, status: true, createdAt: true, lastUsedAt: true },
      });

      const device = await tx.mobileDevice.create({
        data: {
          tenantId: prov.tenantId,
          name: deviceName,
          apiKeyId: apiKey.id,
          status: "ACTIVE",
        },
        select: { id: true, name: true, status: true, createdAt: true, lastSeenAt: true },
      });

      // Audit: bind usedByDeviceId (still within tx; will rollback if any step fails)
      await tx.mobileProvisionToken.update({
        where: { tokenHash },
        data: { usedByDeviceId: device.id },
        select: { id: true },
      });

      // Apply requested assignments (filter to existing tenant forms; keep only ACTIVE)
      const requested = jsonToStringArray(prov.requestedFormIds);
      let assignedFormIds: string[] = [];

      if (requested.length) {
        const forms = await tx.form.findMany({
          where: { tenantId: prov.tenantId, id: { in: requested } },
          select: { id: true, status: true },
        });

        assignedFormIds = forms.filter((f) => f.status === "ACTIVE").map((f) => f.id);

        if (assignedFormIds.length) {
          await tx.mobileDeviceForm.createMany({
            data: assignedFormIds.map((formId) => ({
              tenantId: prov.tenantId,
              deviceId: device.id,
              formId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return { device, apiKey, apiKeyToken: apiKeyGen.token, assignedFormIds };
    });

    return jsonOk(req, {
      device: result.device,
      apiKey: result.apiKey,
      token: result.apiKeyToken, // one-time x-api-key value
      assignedFormIds: result.assignedFormIds,
    });
  } catch (e: unknown) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error("POST /api/mobile/v1/provision/claim failed", e);
    return jsonError(req, 500, "INTERNAL_ERROR", "Internal server error.");
  }
}
