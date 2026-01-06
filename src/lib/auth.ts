import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/http";
import { hashPasswordScrypt, verifyPasswordScrypt, sha256Hex } from "@/lib/password";

export { hashPasswordScrypt, verifyPasswordScrypt, sha256Hex };

export const AUTH_COOKIE_NAME = "lr_session";

type SessionPayload = {
  sub: string;           // userId
  tid: string | null;    // tenantId
  role: string;
  iat: number;
  exp: number;
};

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64urlToBuffer(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replaceAll("-", "+").replaceAll("_", "/") + pad;
  return Buffer.from(b64, "base64");
}

export function getSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;

  if (process.env.NODE_ENV !== "production") {
    return "dev-only-secret-change-me-please";
  }
  throw new Error("AUTH_SESSION_SECRET is missing (min 16 chars).");
}

function sign(part: string, secret: string): string {
  const mac = crypto.createHmac("sha256", secret).update(part).digest();
  return base64url(mac);
}

export function createSessionToken(opts: {
  userId: string;
  tenantId: string | null;
  role: string;
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const ttl = opts.ttlSeconds ?? 60 * 60 * 24 * 30; // 30 days

  const payload: SessionPayload = {
    sub: opts.userId,
    tid: opts.tenantId,
    role: opts.role,
    iat: now,
    exp: now + ttl
  };

  const payloadPart = base64url(JSON.stringify(payload));
  const sig = sign(payloadPart, getSessionSecret());
  return `${payloadPart}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [payloadPart, sig] = token.split(".");
    if (!payloadPart || !sig) return null;

    const expected = sign(payloadPart, getSessionSecret());

    const a = base64urlToBuffer(sig);
    const b = base64urlToBuffer(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(base64urlToBuffer(payloadPart).toString("utf8")) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);

    if (!payload?.sub) return null;
    if (payload.exp <= now) return null;

    return payload;
  } catch {
    return null;
  }
}

function getCookieFromHeader(cookieHeader: string, name: string): string {
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx <= 0) continue;
    const k = p.slice(0, idx).trim();
    if (k !== name) continue;
    return decodeURIComponent(p.slice(idx + 1).trim());
  }
  return "";
}

function getCookieValue(req: Request, name: string): string {
  // NextRequest hat `.cookies`, Request nicht. Wir machen beides möglich.
  const anyReq = req as unknown as { cookies?: { get: (n: string) => { value?: string } | undefined } };
  if (anyReq.cookies?.get) {
    return anyReq.cookies.get(name)?.value ?? "";
  }
  return getCookieFromHeader(req.headers.get("cookie") ?? "", name);
}

export function setAuthCookie(res: NextResponse, token: string): void {
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearAuthCookie(res: NextResponse): void {
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function getCurrentUserFromRequest(req: Request) {
  const token = getCookieValue(req, AUTH_COOKIE_NAME);
  const payload = verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { tenant: true }
  });

  if (!user) return null;
  return { user, tenant: user.tenant };
}

function normalizeRole(role: unknown): string {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replaceAll("-", "_");
}

/**
 * Admin Auth Guard (MVP)
 * - requires valid session cookie
 * - requires tenantId on user
 * - role allowlist (MVP owner/admin)
 */
export async function requireAdminAuth(req: Request) {
  const current = await getCurrentUserFromRequest(req);
  if (!current) throw httpError(401, "UNAUTHORIZED", "Nicht eingeloggt.");

  const { user } = current;
  if (!user.tenantId) throw httpError(403, "FORBIDDEN", "Kein Tenant zugeordnet.");

  const role = normalizeRole(user.role);

  // MVP: tolerate common owner/admin role names (seed + future naming)
  const allowed = new Set([
    "OWNER",
    "ADMIN",
    "TENANT_OWNER",
    "TENANT_ADMIN",
  ]);

  if (!allowed.has(role)) {
    throw httpError(403, "FORBIDDEN", "Keine Berechtigung.");
  }

  return { user, tenantId: user.tenantId, userId: user.id };
}
