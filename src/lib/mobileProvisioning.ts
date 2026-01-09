/**
 * LeadRadar2026A — Mobile Provisioning helpers (TP 3.0)
 *
 * Security:
 * - Provision Token plaintext is NEVER stored. Only tokenHash is stored.
 * - tokenHash/keyHash: prefer HMAC-SHA256(secret, value). Fallback to SHA256(value) if no secret is configured.
 *   (Fallback keeps DEV operable and avoids hard coupling to a specific secret name.)
 *
 * Env (recommended):
 * - MOBILE_PROVISION_TOKEN_SECRET
 * - MOBILE_API_KEY_SECRET
 */

import crypto from "crypto";

function cleanEnv(name: string): string | null {
  const v = process.env[name];
  const t = (v ?? "").trim();
  return t ? t : null;
}

function hmacSha256Hex(secret: string, value: string): string {
  return crypto.createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hashPreferHmac(value: string, secretEnvNames: string[]): string {
  for (const n of secretEnvNames) {
    const s = cleanEnv(n);
    if (s) return hmacSha256Hex(s, value);
  }
  // Fallback (DEV/compat): SHA256 without secret
  return sha256Hex(value);
}

export function clampExpiresInMinutes(input: unknown, def = 30, min = 5, max = 240): number {
  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;
  if (!Number.isFinite(n)) return def;
  const i = Math.round(n);
  return Math.max(min, Math.min(max, i));
}

export function generateProvisionToken(): { token: string; prefix: string } {
  const random = crypto.randomBytes(32).toString("base64url"); // ~43 chars
  const prefix = random.slice(0, 8);
  const token = `prov_${prefix}_${random}`;
  return { token, prefix };
}

export function hashProvisionToken(token: string): string {
  return hashPreferHmac(token, ["MOBILE_PROVISION_TOKEN_SECRET", "TOKEN_HASH_SECRET", "APP_SECRET", "AUTH_SECRET"]);
}

export function generateMobileApiKey(): { token: string; prefix: string; keyHash: string } {
  const random = crypto.randomBytes(32).toString("base64url");
  const prefix = random.slice(0, 8);
  const token = `mkey_${prefix}_${random}`;

  const keyHash = hashPreferHmac(token, ["MOBILE_API_KEY_SECRET", "MOBILE_PROVISION_TOKEN_SECRET", "TOKEN_HASH_SECRET", "APP_SECRET", "AUTH_SECRET"]);
  return { token, prefix, keyHash };
}

export function safeJsonStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean);
}
