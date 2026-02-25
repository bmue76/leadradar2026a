import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/http";

export const MOBILE_API_KEY_PREFIX_LEN = 8;

export type MobileAuthContext = {
  tenantId: string;
  tenantSlug: string;
  apiKeyId: string;
  deviceId: string;
  apiKeyPrefix: string;
};

function getMobileApiKeySecret(): string {
  const s = (process.env.MOBILE_API_KEY_SECRET || "").trim();
  if (!s) throw httpError(500, "MISCONFIGURED", "Server misconfigured.");
  return s;
}

function hmacSha256Hex(secret: string, value: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  if (!aHex || !bHex) return false;
  if (aHex.length !== bHex.length) return false;
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getHeader(req: Request, name: string): string {
  return (req.headers.get(name) || "").trim();
}

function readBearerToken(req: Request): string {
  const v = getHeader(req, "authorization");
  if (!v) return "";
  const lower = v.toLowerCase();
  if (!lower.startsWith("bearer ")) return "";
  return v.slice(7).trim();
}

function safeInvalidKey(): never {
  // Strict, leak-safe: no tenant details, no existence details.
  throw httpError(401, "INVALID_API_KEY", "Invalid API key.");
}

export async function requireMobileAuth(req: Request): Promise<MobileAuthContext> {
  // Accept either:
  // - x-api-key / x-mobile-api-key
  // - Authorization: Bearer <token>
  const apiKeyToken =
    getHeader(req, "x-api-key") || getHeader(req, "x-mobile-api-key") || readBearerToken(req);

  if (!apiKeyToken || apiKeyToken.length < 10) safeInvalidKey();

  const expectedKeyHash = hmacSha256Hex(getMobileApiKeySecret(), apiKeyToken);
  const providedTenantSlug = getHeader(req, "x-tenant-slug");

  let tenantId: string | null = null;
  let tenantSlug: string | null = null;

  // We keep the existing "fast path" when tenant is provided.
  if (providedTenantSlug) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: providedTenantSlug },
      select: { id: true, slug: true },
    });
    if (!tenant) throw httpError(404, "NOT_FOUND", "Not found.");
    tenantId = tenant.id;
    tenantSlug = tenant.slug;
  }

  // Resolve apiKey row
  let apiKeyRow:
    | { id: string; tenantId: string; prefix: string; keyHash: string; status: string; tenantSlug?: string }
    | null = null;

  if (tenantId) {
    // Existing logic: prefix-narrowed lookup + constant time verify
    const prefix = apiKeyToken.slice(0, MOBILE_API_KEY_PREFIX_LEN);

    const candidates = await prisma.mobileApiKey.findMany({
      where: { tenantId, prefix, status: "ACTIVE" },
      select: { id: true, tenantId: true, prefix: true, keyHash: true, status: true },
      take: 50,
    });

    for (const c of candidates) {
      if (timingSafeEqualHex(c.keyHash, expectedKeyHash)) {
        apiKeyRow = c;
        break;
      }
    }

    // Fallback (covers legacy data / prefix mismatch / rare collisions)
    if (!apiKeyRow) {
      const direct = await prisma.mobileApiKey.findFirst({
        where: { tenantId, keyHash: expectedKeyHash, status: "ACTIVE" },
        select: { id: true, tenantId: true, prefix: true, keyHash: true, status: true },
      });
      if (direct) apiKeyRow = direct;
    }

    if (!apiKeyRow) safeInvalidKey();
  } else {
    // tenant-less mode (robust for clients that forgot x-tenant-slug)
    const direct = await prisma.mobileApiKey.findFirst({
      where: { keyHash: expectedKeyHash, status: "ACTIVE" },
      select: {
        id: true,
        tenantId: true,
        prefix: true,
        keyHash: true,
        status: true,
        tenant: { select: { slug: true } },
      },
    });

    if (!direct) safeInvalidKey();

    apiKeyRow = {
      id: direct.id,
      tenantId: direct.tenantId,
      prefix: direct.prefix,
      keyHash: direct.keyHash,
      status: direct.status,
      tenantSlug: direct.tenant?.slug,
    };

    tenantId = direct.tenantId;
    tenantSlug = direct.tenant?.slug || null;
  }

  if (!tenantId) safeInvalidKey();

  if (!tenantSlug) {
    // Should be rare; fill slug to keep context consistent.
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    tenantSlug = t?.slug || "";
  }

  // Resolve the device via apiKeyId
  const device = await prisma.mobileDevice.findFirst({
    where: { tenantId, apiKeyId: apiKeyRow.id },
    select: { id: true, status: true },
  });

  if (!device) safeInvalidKey();

  const deviceStatus = String(device.status || "").toUpperCase();
  if (deviceStatus !== "ACTIVE") throw httpError(403, "DEVICE_DISABLED", "Device disabled.");

  return {
    tenantId,
    tenantSlug,
    apiKeyId: apiKeyRow.id,
    deviceId: device.id,
    apiKeyPrefix: apiKeyRow.prefix,
  };
}
