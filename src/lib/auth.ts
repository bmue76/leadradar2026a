import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/server/prisma";
import { httpError } from "@/lib/http";
import { hashPasswordScrypt, verifyPasswordScrypt, sha256Hex } from "@/lib/password";
import { auth as nextAuth } from "@/auth";

export { hashPasswordScrypt, verifyPasswordScrypt, sha256Hex };

export const AUTH_COOKIE_NAME = "lr_session";

type SessionPayload = {
  sub: string; // userId
  tid: string | null; // tenantId
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
    exp: now + ttl,
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
  // NextRequest has `.cookies`, Request does not. Support both.
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
    maxAge: 60 * 60 * 24 * 30,
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
    maxAge: 0,
  });
}

function pickDevTenantSlug(): string | null {
  const candidates = [
    process.env.DEV_DEFAULT_TENANT_SLUG,
    process.env.SEED_TENANT_SLUG,
    process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG,
    process.env.NEXT_PUBLIC_TENANT_SLUG_DEV,
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);

  return candidates[0]?.toLowerCase() ?? null;
}

function pickDevTenantName(slug: string): string {
  const n = (process.env.SEED_TENANT_NAME ?? "").trim();
  return n || `LeadRadar ${slug}`;
}

function pickDevTenantCountry(): string {
  const c = (process.env.SEED_TENANT_COUNTRY ?? "CH").trim().toUpperCase();
  return c.length >= 2 ? c.slice(0, 2) : "CH";
}

async function loadUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tenant: true },
  });
  if (!user) return null;
  return { user, tenant: user.tenant };
}

async function ensureDevTenant(): Promise<string | null> {
  if (process.env.NODE_ENV === "production") return null;

  const slug = pickDevTenantSlug();

  // If we have a preferred slug, ensure it exists (create if missing)
  if (slug) {
    const existing = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (existing?.id) return existing.id;

    const created = await prisma.tenant.create({
      data: {
        slug,
        name: pickDevTenantName(slug),
        country: pickDevTenantCountry(),
      },
      select: { id: true },
    });

    return created.id;
  }

  // No slug: if exactly one tenant exists, use it
  const tenants = await prisma.tenant.findMany({ select: { id: true }, take: 2 });
  if (tenants.length === 1) return tenants[0].id;

  return null;
}

async function devEnsureTenantAssigned(userId: string) {
  if (process.env.NODE_ENV === "production") return null;

  const tenantId = await ensureDevTenant();
  if (!tenantId) return null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      tenantId,
      role: "TENANT_OWNER",
      emailVerified: new Date(),
    },
  });

  return await loadUser(userId);
}

export async function getCurrentUserFromRequest(req: Request) {
  // 1) Legacy LR session cookie
  const lrToken = getCookieValue(req, AUTH_COOKIE_NAME);
  const payload = verifySessionToken(lrToken);
  if (payload?.sub) {
    const loaded = await loadUser(payload.sub);
    if (loaded) return loaded;
  }

  // 2) DEV-only header override
  const headerUserId = (req.headers.get("x-user-id") || "").trim();
  if (headerUserId && process.env.NODE_ENV !== "production") {
    const loaded = await loadUser(headerUserId);
    if (loaded) return loaded;
  }

  // 3) NextAuth (Magic Link) session
  try {
    const session = await nextAuth();
    const sessionUserId = ((session?.user as any)?.id || "").trim();
    if (sessionUserId) {
      const loaded = await loadUser(sessionUserId);
      if (loaded) return loaded;
    }
  } catch {
    // ignore
  }

  return null;
}

export async function requireAdminAuth(req: Request) {
  let current = await getCurrentUserFromRequest(req);
  if (!current) throw httpError(401, "UNAUTHORIZED", "Nicht eingeloggt.");

  // DEV convenience: if user has no tenant, auto-create/assign default tenant
  if (!current.user.tenantId && process.env.NODE_ENV !== "production") {
    const assigned = await devEnsureTenantAssigned(current.user.id);
    if (assigned) current = assigned;
  }

  const { user } = current;
  if (!user.tenantId) throw httpError(403, "FORBIDDEN", "Kein Tenant zugeordnet.");

  // DEV: allow any tenant user to use Admin UI (MVP convenience)
  if (process.env.NODE_ENV !== "production") {
    return { user, tenantId: user.tenantId, userId: user.id };
  }

  const role = String(user.role ?? "").toUpperCase();
  if (!(role === "OWNER" || role === "ADMIN")) {
    throw httpError(403, "FORBIDDEN", "Keine Berechtigung.");
  }

  return { user, tenantId: user.tenantId, userId: user.id };
}
