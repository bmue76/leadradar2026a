import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === "object" && v !== null;
}

function readString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readNestedString(obj: unknown, path: string[]): string | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (!isRecord(cur)) return null;
    cur = cur[key];
  }
  return readString(cur);
}

function readClaim(token: unknown, keys: string[]): string | null {
  if (!isRecord(token)) return null;
  for (const k of keys) {
    const v = readString(token[k]);
    if (v) return v;
  }
  return null;
}

function firstNonEmpty(...vals: Array<string | undefined | null>): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function getSecret(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("Missing AUTH_SECRET (or NEXTAUTH_SECRET)");
  return s;
}

function baseCookieName(name: string): string {
  // authjs.session-token.0 -> authjs.session-token
  return name.replace(/\.\d+$/, "");
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function buildCookieHeader(req: NextRequest): string {
  const parts = req.cookies.getAll().map((c) => `${c.name}=${c.value}`);
  return parts.join("; ");
}

async function getAnyToken(req: NextRequest): Promise<{
  token: unknown | null;
  cookieNames: string[];
  cookieNameUsed: string | null;
}> {
  const secret = getSecret();

  const cookieNames = req.cookies.getAll().map((c) => c.name);
  const bases = uniq(cookieNames.map(baseCookieName));

  // Known bases (v5 + fallbacks)
  const known = [
    "__Secure-authjs.session-token",
    "authjs.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.session-token",
  ];

  const candidates = uniq([...bases, ...known]).filter((n) => n.includes("session-token"));

  // Try explicit cookieName candidates first (handles chunked cookies via base name)
  for (const cookieName of candidates) {
    const t = await getToken({ req, secret, cookieName });
    if (t) return { token: t as unknown, cookieNames, cookieNameUsed: cookieName };
  }

  // Last resort: default behavior
  const t = await getToken({ req, secret });
  return { token: t ? (t as unknown) : null, cookieNames, cookieNameUsed: t ? "(default)" : null };
}

function allowDebugOnThisHost(req: NextRequest): boolean {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const isLocalhost =
    host.includes("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
  return process.env.NODE_ENV !== "production" || isLocalhost;
}

function getDevDefaultTenantSlug(): string | null {
  return firstNonEmpty(
    process.env.DEV_DEFAULT_TENANT_SLUG,
    process.env.SEED_TENANT_SLUG,
    process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG,
    process.env.NEXT_PUBLIC_TENANT_SLUG_DEV
  );
}

type TenantCtx = { tenantId: string | null; tenantSlug: string | null };

function extractTenantCtxFromCurrentJson(json: unknown): TenantCtx {
  const tenantId =
    readNestedString(json, ["data", "tenantId"]) ||
    readNestedString(json, ["data", "id"]) ||
    readNestedString(json, ["data", "tenant", "id"]) ||
    null;

  const tenantSlug =
    readNestedString(json, ["data", "tenantSlug"]) ||
    readNestedString(json, ["data", "slug"]) ||
    readNestedString(json, ["data", "tenant", "slug"]) ||
    null;

  return { tenantId, tenantSlug };
}

async function resolveTenantCtxViaCurrent(req: NextRequest): Promise<TenantCtx | null> {
  try {
    const url = new URL("/api/admin/v1/tenants/current", req.url);
    const cookie = (req.headers.get("cookie") ?? "").trim() || buildCookieHeader(req);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        cookie,
        "x-mw-internal": "1",
      },
      cache: "no-store",
    });

    if (!res.ok) return null;

    const json: unknown = await res.json().catch(() => null as unknown);
    const ctx = extractTenantCtxFromCurrentJson(json);
    if (!ctx.tenantId && !ctx.tenantSlug) return null;
    return ctx;
  } catch {
    return null;
  }
}

const TENANT_CTX_COOKIE = "lr_admin_tenant_ctx"; // "<tenantId>|<tenantSlug>"

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/_next")) return NextResponse.next();
  if (pathname === "/favicon.ico") return NextResponse.next();
  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  const isAdminUi = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!isAdminUi && !isAdminApi) return NextResponse.next();

  const allowDebug = allowDebugOnThisHost(req);
  const { token, cookieNames, cookieNameUsed } = await getAnyToken(req);

  // Protect admin pages
  if (isAdminUi && !token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Inject headers for admin API (method-independent)
  if (isAdminApi) {
    const headers = new Headers(req.headers);
    const isInternal = (headers.get("x-mw-internal") ?? "") === "1";

    const existingTenantSlug = (headers.get("x-tenant-slug") ?? "").trim();
    const existingTenantId = (headers.get("x-tenant-id") ?? "").trim();
    const existingUserId = (headers.get("x-user-id") || headers.get("x-admin-user-id") || "").trim();

    let debugTenantSlugSource = "none";
    let debugTenantIdSource = "none";
    let debugUserIdSource = "none";

    // 1) Token claims
    if (token) {
      const userId = readClaim(token, ["uid", "sub", "userId", "id"]);
      const tenantId = readClaim(token, ["tenantId", "tid"]);
      const role = readClaim(token, ["role"]) ?? "TENANT_OWNER";
      const tenantSlug = readClaim(token, ["tenantSlug", "tslug", "tenant_slug"]);

      if (userId) {
        headers.set("x-user-id", userId);
        headers.set("x-admin-user-id", userId);
        debugUserIdSource = "token";
      }
      if (tenantId) {
        headers.set("x-tenant-id", tenantId);
        debugTenantIdSource = "token";
      }
      if (role) headers.set("x-user-role", role);
      if (tenantSlug) {
        headers.set("x-tenant-slug", tenantSlug);
        debugTenantSlugSource = "token";
      }
    }

    // 2) Request-provided passthrough/override
    if (existingUserId) {
      headers.set("x-user-id", existingUserId);
      headers.set("x-admin-user-id", existingUserId);
      if (debugUserIdSource === "none") debugUserIdSource = "request";
    }
    if (existingTenantId) {
      headers.set("x-tenant-id", existingTenantId);
      if (debugTenantIdSource === "none") debugTenantIdSource = "request";
    }
    if (existingTenantSlug) {
      headers.set("x-tenant-slug", existingTenantSlug);
      if (debugTenantSlugSource === "none") debugTenantSlugSource = "request";
    }

    // 3) Cookie cache (tenantId-bound)
    const nowTenantId = (headers.get("x-tenant-id") ?? "").trim();
    const nowTenantSlug = (headers.get("x-tenant-slug") ?? "").trim();
    if (!nowTenantSlug && nowTenantId) {
      const v = (req.cookies.get(TENANT_CTX_COOKIE)?.value ?? "").trim();
      if (v && v.includes("|")) {
        const [cid, cslug] = v.split("|");
        if (cid === nowTenantId && cslug && cslug.trim()) {
          headers.set("x-tenant-slug", cslug.trim());
          debugTenantSlugSource = "cookie";
        }
      }
    }

    // 4) Resolve via session `/tenants/current` (avoid recursion via x-mw-internal)
    const afterCookieTenantId = (headers.get("x-tenant-id") ?? "").trim();
    const afterCookieTenantSlug = (headers.get("x-tenant-slug") ?? "").trim();
    if (!isInternal && (!afterCookieTenantId || !afterCookieTenantSlug)) {
      const resolved = await resolveTenantCtxViaCurrent(req);
      if (resolved) {
        if (!afterCookieTenantId && resolved.tenantId) {
          headers.set("x-tenant-id", resolved.tenantId);
          debugTenantIdSource = "fetch(tenants/current)";
        }
        if (!afterCookieTenantSlug && resolved.tenantSlug) {
          headers.set("x-tenant-slug", resolved.tenantSlug);
          debugTenantSlugSource = "fetch(tenants/current)";
        }
      }
    }

    // 5) DEV/localhost fallbacks (helps curl smoke tests)
    if (allowDebug) {
      const finalUserId = (headers.get("x-user-id") || "").trim();
      if (!finalUserId) {
        const devUserId = (process.env.DEV_ADMIN_USER_ID ?? "").trim();
        if (devUserId) {
          headers.set("x-user-id", devUserId);
          headers.set("x-admin-user-id", devUserId);
          debugUserIdSource = "env(DEV_ADMIN_USER_ID)";
        }
      }

      const finalTenantId = (headers.get("x-tenant-id") || "").trim();
      if (!finalTenantId) {
        const devTenantId = (process.env.DEV_TENANT_ID ?? "").trim();
        if (devTenantId) {
          headers.set("x-tenant-id", devTenantId);
          debugTenantIdSource = "env(DEV_TENANT_ID)";
        }
      }

      const finalSlug = (headers.get("x-tenant-slug") || "").trim();
      if (!finalSlug) {
        const envSlug = getDevDefaultTenantSlug();
        if (envSlug) {
          headers.set("x-tenant-slug", envSlug);
          debugTenantSlugSource = "env(devDefaultSlug)";
        } else {
          headers.set("x-tenant-slug", "atlex");
          debugTenantSlugSource = "localhost(default=atlex)";
        }
      }
    }

    const res = NextResponse.next({ request: { headers } });

    // refresh cache cookie if we have both
    const cookieTenantId = (headers.get("x-tenant-id") ?? "").trim();
    const cookieTenantSlug = (headers.get("x-tenant-slug") ?? "").trim();
    if (cookieTenantId && cookieTenantSlug) {
      res.cookies.set(TENANT_CTX_COOKIE, `${cookieTenantId}|${cookieTenantSlug}`, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
    }

    if (allowDebug) {
      res.headers.set("x-debug-mw-hit", "1");
      res.headers.set("x-debug-mw-token", token ? "1" : "0");
      res.headers.set("x-debug-mw-cookieNameUsed", cookieNameUsed ?? "");
      res.headers.set("x-debug-mw-cookieNames", cookieNames.join(","));
      res.headers.set("x-debug-mw-path", pathname);
      res.headers.set("x-debug-mw-method", req.method);
      res.headers.set("x-debug-mw-tenantIdSource", debugTenantIdSource);
      res.headers.set("x-debug-mw-tenantSlugSource", debugTenantSlugSource);
      res.headers.set("x-debug-mw-userIdSource", debugUserIdSource);
      res.headers.set("x-debug-mw-internal", isInternal ? "1" : "0");
    }

    return res;
  }

  return NextResponse.next();
}
