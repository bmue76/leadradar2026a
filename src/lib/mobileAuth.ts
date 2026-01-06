import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/http";

const HEADER_NAME = "x-api-key";
const PREFIX_LEN = 8;

// We deliberately only support x-api-key to keep mobile simple & deterministic.
export type MobileAuthContext = {
  tenantId: string;
  apiKeyId: string;
  apiKeyPrefix: string;
  deviceId: string;
};

function mustGetSecret(): string {
  const v = process.env.MOBILE_API_KEY_SECRET;
  if (!v || v.trim().length < 16) {
    // 16 is a minimal guard; recommend 32+ bytes.
    throw httpError(500, "SERVER_MISCONFIGURED", "MOBILE_API_KEY_SECRET is not configured.");
  }
  return v;
}

export function generateMobileApiKeyToken(): string {
  // 32 bytes => ~43 chars base64url
  return randomBytes(32).toString("base64url");
}

export function getApiKeyPrefix(token: string): string {
  return token.slice(0, PREFIX_LEN);
}

export function hashMobileApiKey(token: string): string {
  // HMAC-SHA256(token, secret) => hex
  const secret = mustGetSecret();
  return createHmac("sha256", secret).update(token, "utf8").digest("hex");
}

function safeEqualHex(aHex: string, bHex: string): boolean {
  // Both should be same length (sha256 hex = 64 chars => 32 bytes)
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function requireMobileAuth(req: Request): Promise<MobileAuthContext> {
  const token = req.headers.get(HEADER_NAME)?.trim() ?? "";
  if (!token) throw httpError(401, "UNAUTHENTICATED", "Missing API key.");

  // Basic sanity: avoid prefix errors / tiny tokens
  if (token.length < PREFIX_LEN + 8) {
    throw httpError(401, "UNAUTHENTICATED", "Invalid API key.");
  }

  const prefix = getApiKeyPrefix(token);
  const tokenHash = hashMobileApiKey(token);

  // Prefix narrows lookup without storing plaintext. (We still verify by HMAC hash.)
  const candidates = await prisma.mobileApiKey.findMany({
    where: { prefix, status: "ACTIVE" },
    select: {
      id: true,
      tenantId: true,
      prefix: true,
      keyHash: true,
      status: true,
      lastUsedAt: true,
      device: {
        select: { id: true, status: true, lastSeenAt: true },
      },
    },
    take: 25,
  });

  for (const k of candidates) {
    if (!safeEqualHex(tokenHash, k.keyHash)) continue;

    // Matched the key – now enforce device binding & device status.
    const device = k.device;
    if (!device) {
      throw httpError(401, "UNAUTHENTICATED", "API key is not bound to a device.");
    }
    if (device.status !== "ACTIVE") {
      throw httpError(401, "UNAUTHENTICATED", "Device is disabled.");
    }

    // Best-effort "last used" timestamps (avoid write storm: only update if older than 60s)
    const now = new Date();
    const shouldUpdateKey =
      !k.lastUsedAt || now.getTime() - k.lastUsedAt.getTime() > 60_000;
    const shouldUpdateDevice =
      !device.lastSeenAt || now.getTime() - device.lastSeenAt.getTime() > 60_000;

    if (shouldUpdateKey || shouldUpdateDevice) {
      await prisma.$transaction([
        ...(shouldUpdateKey
          ? [
              prisma.mobileApiKey.update({
                where: { id: k.id },
                data: { lastUsedAt: now },
              }),
            ]
          : []),
        ...(shouldUpdateDevice
          ? [
              prisma.mobileDevice.update({
                where: { id: device.id },
                data: { lastSeenAt: now },
              }),
            ]
          : []),
      ]);
    }

    return {
      tenantId: k.tenantId,
      apiKeyId: k.id,
      apiKeyPrefix: k.prefix,
      deviceId: device.id,
    };
  }

  // No match found
  throw httpError(401, "UNAUTHENTICATED", "Invalid API key.");
}

export async function adminCreateMobileApiKey(args: {
  tenantId: string;
  name: string;
  deviceName?: string;
  createdByUserId?: string | null;
}): Promise<{ id: string; prefix: string; apiKey: string; createdAt: Date; deviceId?: string }> {
  const token = generateMobileApiKeyToken();
  const prefix = getApiKeyPrefix(token);
  const keyHash = hashMobileApiKey(token);

  const res = await prisma.$transaction(async (tx) => {
    const key = await tx.mobileApiKey.create({
      data: {
        tenantId: args.tenantId,
        name: args.name,
        prefix,
        keyHash,
        status: "ACTIVE",
        createdByUserId: args.createdByUserId ?? null,
      },
      select: { id: true, prefix: true, createdAt: true },
    });

    let deviceId: string | undefined;
    if (args.deviceName?.trim()) {
      const device = await tx.mobileDevice.create({
        data: {
          tenantId: args.tenantId,
          name: args.deviceName.trim(),
          apiKeyId: key.id,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      deviceId = device.id;
    }

    return { key, deviceId };
  });

  return {
    id: res.key.id,
    prefix: res.key.prefix,
    apiKey: token, // cleartext only here
    createdAt: res.key.createdAt,
    ...(res.deviceId ? { deviceId: res.deviceId } : {}),
  };
}

export async function adminRevokeMobileApiKey(args: { tenantId: string; id: string }) {
  const now = new Date();

  // leak-safe: revoke only within tenant scope, else 404.
  const existing = await prisma.mobileApiKey.findFirst({
    where: { id: args.id, tenantId: args.tenantId },
    select: { id: true },
  });
  if (!existing) throw httpError(404, "NOT_FOUND", "API key not found.");

  await prisma.$transaction([
    prisma.mobileApiKey.update({
      where: { id: args.id },
      data: { status: "REVOKED", revokedAt: now },
    }),
    prisma.mobileDevice.updateMany({
      where: { tenantId: args.tenantId, apiKeyId: args.id },
      data: { status: "DISABLED" },
    }),
  ]);

  return { id: args.id, status: "REVOKED" as const };
}
