import crypto from "node:crypto";

const KEYLEN = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

// Format: scrypt$N$r$p$saltB64$hashB64
export async function hashPasswordScrypt(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 128 * 1024 * 1024
  });

  return [
    "scrypt",
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString("base64"),
    Buffer.from(derivedKey).toString("base64")
  ].join("$");
}

// Backward-compatible alias (so seed.ts + ältere Stellen weiter laufen)
export async function hashPassword(password: string): Promise<string> {
  return hashPasswordScrypt(password);
}

export async function verifyPasswordScrypt(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4], "base64");
    const expected = Buffer.from(parts[5], "base64");

    const actual = crypto.scryptSync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * 1024 * 1024
    });

    return expected.length === actual.length && crypto.timingSafeEqual(expected, Buffer.from(actual));
  } catch {
    return false;
  }
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
