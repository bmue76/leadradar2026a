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

function safeInvalidKey(): never {
  // No tenant details, no existence details. Strict.
  throw httpError(401, "INVALID_API_KEY", "Invalid API key.");
}

export async function requireMobileAuth(req: Request): Promise<MobileAuthContext> {
  const tenantSlug = getHeader(req, "x-tenant-slug");
  if (!tenantSlug) throw httpError(400, "TENANT_REQUIRED", "Missing x-tenant-slug header.");

  const apiKeyToken = getHeader(req, "x-api-key") || getHeader(req, "x-mobile-api-key");
  if (!apiKeyToken || apiKeyToken.length < 10) safeInvalidKey();

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });
  if (!tenant) throw httpError(404, "NOT_FOUND", "Not found.");

  const prefix = apiKeyToken.slice(0, MOBILE_API_KEY_PREFIX_LEN);
  const expectedKeyHash = hmacSha256Hex(getMobileApiKeySecret(), apiKeyToken);

  // Narrow by prefix for index-friendly lookup, then verify exact keyHash in constant time.
  const candidates = await prisma.mobileApiKey.findMany({
    where: { tenantId: tenant.id, prefix, status: "ACTIVE" },
    select: { id: true, tenantId: true, prefix: true, keyHash: true, status: true },
    take: 50,
  });

  let apiKeyRow:
    | { id: string; tenantId: string; prefix: string; keyHash: string; status: string }
    | null = null;

  for (const c of candidates) {
    if (timingSafeEqualHex(c.keyHash, expectedKeyHash)) {
      apiKeyRow = c;
      break;
    }
  }

  // Fallback (covers legacy data / prefix mismatch / rare collisions)
  if (!apiKeyRow) {
    const direct = await prisma.mobileApiKey.findFirst({
      where: { tenantId: tenant.id, keyHash: expectedKeyHash, status: "ACTIVE" },
      select: { id: true, tenantId: true, prefix: true, keyHash: true, status: true },
    });
    if (direct) apiKeyRow = direct;
  }

  if (!apiKeyRow) safeInvalidKey();

  // CRITICAL: resolve the device via apiKeyId (NOT via tenant-only heuristics)
  const device = await prisma.mobileDevice.findFirst({
    where: { tenantId: tenant.id, apiKeyId: apiKeyRow.id },
    select: { id: true, status: true },
  });

  if (!device) safeInvalidKey();

  const deviceStatus = String(device.status || "").toUpperCase();
  if (deviceStatus !== "ACTIVE") throw httpError(403, "DEVICE_DISABLED", "Device disabled.");

  return {
    tenantId: tenant.id,
    tenantSlug,
    apiKeyId: apiKeyRow.id,
    deviceId: device.id,
    apiKeyPrefix: apiKeyRow.prefix,
  };
}
