import { createHash, timingSafeEqual } from "node:crypto";

export function normalizeProvisionToken(input: unknown): string {
  const raw = typeof input === "string" ? input : "";
  // trim + collapse surrounding whitespace; keep internal chars as-is
  return raw.trim();
}

export function hashProvisionToken(token: string): string {
  // sha256 hex
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function safeEqHex(a: string, b: string): boolean {
  // Optional helper (not required when lookup is by hash), but safe for comparisons.
  if (a.length !== b.length) return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return timingSafeEqual(ba, bb);
}
