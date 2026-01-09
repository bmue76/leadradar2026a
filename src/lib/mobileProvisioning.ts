import crypto from "crypto";

export function hmacSha256Hex(secret: string, value: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function provisionTokenHash(secret: string, token: string): string {
  return hmacSha256Hex(secret, token);
}

export function normalizeProvisionToken(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function generatePrefix8(): string {
  // 6 bytes base64url => 8 chars
  return crypto.randomBytes(6).toString("base64url").slice(0, 8);
}

export function generateProvisionToken(secret: string): { token: string; prefix: string; tokenHash: string } {
  const prefix = generatePrefix8();
  // Token body starts with prefix (human-friendly), then add randomness.
  const body = `${prefix}${crypto.randomBytes(24).toString("base64url")}`;
  const token = `prov_${prefix}_${body}`;
  const tokenHash = provisionTokenHash(secret, token);
  return { token, prefix, tokenHash };
}
