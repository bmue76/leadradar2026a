import { z } from "zod";
import crypto from "crypto";
import { jsonOk, jsonError } from "@/lib/api";
import { validateBody, httpError, isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getClientIp, rateLimitCheck } from "@/lib/rateLimit";
import { normalizeProvisionToken, provisionTokenHash } from "@/lib/mobileProvisioning";

export const runtime = "nodejs";

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
  // No details, no leaks.
  throw httpError(401, "INVALID_PROVISION_TOKEN", "Invalid provision token.");
}

function tokenNotClaimable(code: "PROVISION_TOKEN_USED" | "PROVISION_TOKEN_REVOKED" | "PROVISION_TOKEN_EXPIRED"): never {
  // Balanced policy: token exists but cannot be claimed
  throw httpError(409, code, "Provision token cannot be claimed.");
}

function rateLimitOrThrow(key: string, limit: number, windowSec: number) {
  const r = rateLimitCheck({ key, limit, windowSec });
  if (!r.ok) {
    throw httpError(429, "RATE_LIMITED", "Too many requests.", { retryAfterSec: r.retryAfterSec });
  }
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
    const ip = getClientIp(req);

    // Phase 1 Abuse protection (best-effort, in-memory):
    // - 10/min per IP
    // - 5/min per tokenHash prefix (after token parsing)
    rateLimitOrThrow(`prov_claim:ip:${ip}`, 10, 60);

    let body: z.infer<typeof ClaimSchema>;
    try {
      body = await validateBody(req, ClaimSchema);
    } catch (e: unknown) {
      // For mobile claim: do not expose validation details.
      if (isHttpError(e)) safeInvalidToken();
      throw e;
    }

    const token = normalizeProvisionToken(body.token);
    if (!token) safeInvalidToken();

    const provSecret = getProvisionSecret();
    const tokenHash = provisionTokenHash(provSecret, token);

    rateLimitOrThrow(`prov_claim:th:${tokenHash.slice(0, 16)}`, 5, 60);

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

      // Balanced error semantics (still non-tenant-leaky due to high-entropy token):
      if (prov.status === "REVOKED") tokenNotClaimable("PROVISION_TOKEN_REVOKED");
      if (prov.status === "USED" || prov.usedAt) tokenNotClaimable("PROVISION_TOKEN_USED");
      if (prov.expiresAt <= now) tokenNotClaimable("PROVISION_TOKEN_EXPIRED");

      // Atomic single-use enforcement (race-safe): exactly one update wins.
      const locked = await tx.mobileProvisionToken.updateMany({
        where: {
          tokenHash,
          status: "ACTIVE",
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { status: "USED", usedAt: now },
      });

      if (locked.count !== 1) {
        // Determine best-effort reason (still safe because token is known).
        const cur = await tx.mobileProvisionToken.findUnique({
          where: { tokenHash },
          select: { status: true, expiresAt: true, usedAt: true },
        });

        if (!cur) safeInvalidToken();
        if (cur.status === "REVOKED") tokenNotClaimable("PROVISION_TOKEN_REVOKED");
        if (cur.status === "USED" || cur.usedAt) tokenNotClaimable("PROVISION_TOKEN_USED");
        if (cur.expiresAt <= now) tokenNotClaimable("PROVISION_TOKEN_EXPIRED");

        // Fallback: no details.
        safeInvalidToken();
      }

      const deviceName = (body.deviceName?.trim() || prov.requestedDeviceName?.trim() || "Mobile Device").slice(0, 120);

      // Create api key + device
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

      // Attach device id to provisioning record (audit)
      await tx.mobileProvisionToken.update({
        where: { id: prov.id },
        data: { usedByDeviceId: device.id },
        select: { id: true },
      });

      // Apply requested assignments (filter to existing tenant forms)
      const requested = jsonToStringArray(prov.requestedFormIds);
      let assignedFormIds: string[] = [];

      if (requested.length) {
        const forms = await tx.form.findMany({
          where: { tenantId: prov.tenantId, id: { in: requested } },
          select: { id: true, status: true },
        });

        // Keep only ACTIVE forms to match mobile semantics
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
