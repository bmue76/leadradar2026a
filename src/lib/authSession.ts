/**
 * LeadRadar2026A – Auth Session (MVP)
 * - httpOnly Cookie
 * - HMAC-SHA256 signed payload (base64url(payload).base64url(sig))
 * - Works in Node + Edge (middleware) via WebCrypto
 */
export const SESSION_COOKIE_NAME = "lr_admin_session_v1";

export type SessionPayload = {
  v: 1;
  uid: string;
  tid?: string;
  iat: number; // epoch seconds
  exp: number; // epoch seconds
};

const te = new TextEncoder();

function getEnvSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.trim().length < 16) {
    // 16 is a sanity check; use 32+ chars in real envs
    throw new Error("AUTH_SESSION_SECRET missing or too short.");
  }
  return secret;
}

function bytesToBase64(bytes: Uint8Array): string {
  // Edge: no Buffer guaranteed, use btoa
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncodeBytes(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecodeToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return base64ToBytes(b64);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

let cachedKey: CryptoKey | null = null;
async function getHmacKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const secret = getEnvSecret();
  cachedKey = await crypto.subtle.importKey(
    "raw",
    te.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return cachedKey;
}

async function hmacSha256(message: string): Promise<Uint8Array> {
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, te.encode(message));
  return new Uint8Array(sig);
}

export function getCookieFromHeader(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (!p) continue;
    const idx = p.indexOf("=");
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    if (k === name) return decodeURIComponent(p.slice(idx + 1));
  }
  return undefined;
}

export function getSessionTokenFromRequest(req: Request): string | undefined {
  const cookieHeader = req.headers.get("cookie");
  return getCookieFromHeader(cookieHeader, SESSION_COOKIE_NAME);
}

export async function createSessionToken(input: { uid: string; tid?: string }, ttlSeconds: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { v: 1, uid: input.uid, tid: input.tid, iat: now, exp: now + ttlSeconds };
  const payloadJson = JSON.stringify(payload);
  const payloadB64u = b64urlEncodeBytes(te.encode(payloadJson));
  const sig = await hmacSha256(payloadB64u);
  const sigB64u = b64urlEncodeBytes(sig);
  return `${payloadB64u}.${sigB64u}`;
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64u, sigB64u] = parts;

  // verify signature
  const expectedSig = await hmacSha256(payloadB64u);
  const gotSig = b64urlDecodeToBytes(sigB64u);
  if (!constantTimeEqual(expectedSig, gotSig)) return null;

  // parse payload
  let payload: SessionPayload;
  try {
    const payloadBytes = b64urlDecodeToBytes(payloadB64u);
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionPayload;
  } catch {
    return null;
  }

  if (!payload || payload.v !== 1 || !payload.uid || !payload.iat || !payload.exp) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;

  return payload;
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

export function buildSessionSetCookie(token: string, ttlSeconds: number): string {
  const secure = isProd() ? " Secure;" : "";
  // SameSite=Lax is good for typical login flows
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)};`,
    " Path=/;",
    ` Max-Age=${ttlSeconds};`,
    " HttpOnly;",
    " SameSite=Lax;",
    secure,
  ].join("");
}

export function buildSessionClearCookie(): string {
  const secure = isProd() ? " Secure;" : "";
  return [
    `${SESSION_COOKIE_NAME}=;`,
    " Path=/;",
    " Max-Age=0;",
    " HttpOnly;",
    " SameSite=Lax;",
    secure,
  ].join("");
}
