import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === "object" && v !== null;
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function readClaim(token: unknown, keys: string[]): string | undefined {
  if (!isRecord(token)) return undefined;
  for (const k of keys) {
    const v = readString(token[k]);
    if (v && v.trim()) return v.trim();
  }
  return undefined;
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
    const token = await getToken({ req, secret, cookieName });
    if (token) return { token, cookieNames, cookieNameUsed: cookieName };
  }

  // Last resort: default behavior
  const token = await getToken({ req, secret });
  return { token, cookieNames, cookieNameUsed: token ? "(default)" : null };
}

function extractSlugFromTenantCurrentJson(json: any): string | null {
  // Be tolerant to response shapes
  const candidates = [
    json?.data?.slug,
    json?.data?.tenant?.slug,
    json?.data?.tenantSlug,
    json?.data?.currentTenant?.slug,
    json?.slug,
    json?.tenant?.slug,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

async function resolveTenantSlugViaCurrent(req: NextRequest): Promise<string | null> {
  try {
    const url = new URL("/api/admin/v1/tenants/current", req.url);

    // Forward cookies for session auth + mark as internal to avoid recursion
    const cookie = req.headers.get("cookie") ?? "";
    const res = await fetch(url, {
      method: "GET",
      headers: {
        cookie,
        "x-mw-internal": "1",
      },
      cache: "no-store",
    });

    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json) return null;

    return extractSlugFromTenantCurrentJson(json);
  } catch {
    return null;
  }
}

const TENANT_CTX_COOKIE = "lr_admin_tenant_ctx"; // value: "<tenantId>|<tenantSlug>"

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/_next")) return NextResponse.next();
  if (pathname === "/favicon.ico") return NextResponse.next();

  const isAdminUi = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!isAdminUi && !isAdminApi) return NextResponse.next();

  const { token, cookieNames, cookieNameUsed } = await getAnyToken(req);

  // Protect admin pages (UI)
  if (isAdminUi && !token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Admin API: inject/passthrough headers for ALL METHODS (GET/POST/PATCH/DELETE)
  if (isAdminApi) {
    const headers = new Headers(req.headers);

    const internal = (headers.get("x-mw-internal") ?? "").trim() === "1";

    const existingUserId = (headers.get("x-user-id") || headers.get("x-admin-user-id") || "").trim();
    const existingTenantId = (headers.get("x-tenant-id") || "").trim();
    const existingTenantSlug = (headers.get("x-tenant-slug") || "").trim();
    const existingRole = (headers.get("x-user-role") || "").trim();

    // Ensure alias if provided
    if (existingUserId) {
      headers.set("x-user-id", existingUserId);
      headers.set("x-admin-user-id", existingUserId);
    }

    let debugSlugSource: string = "none";

    if (token) {
      const userId =
        existingUserId ||
        readClaim(token, ["uid", "sub", "userId", "id"]);

      const tenantId =
        existingTenantId ||
        readClaim(token, ["tenantId", "tid"]);

      let tenantSlug =
        existingTenantSlug ||
        readClaim(token, ["tenantSlug", "tslug", "tenant_slug", "slug"]);

      const role =
        existingRole ||
        readClaim(token, ["role", "userRole"]) ||
        "TENANT_OWNER";

      if (userId) {
        headers.set("x-user-id", userId);
        headers.set("x-admin-user-id", userId);
      }
      if (tenantId) headers.set("x-tenant-id", tenantId);
      if (role) headers.set("x-user-role", role);

      // 1) If slug already present -> keep
      if (tenantSlug) {
        headers.set("x-tenant-slug", tenantSlug);
        debugSlugSource = existingTenantSlug ? "request" : "token";
      } else if (tenantId) {
        // 2) Try cached cookie (tenantId-bound)
        const ctxCookie = (req.cookies.get(TENANT_CTX_COOKIE)?.value ?? "").trim();
        if (ctxCookie && ctxCookie.includes("|")) {
          const [cid, cslug] = ctxCookie.split("|");
          if (cid === tenantId && cslug && cslug.trim()) {
            tenantSlug = cslug.trim();
            headers.set("x-tenant-slug", tenantSlug);
            debugSlugSource = "cookie";
          }
        }

        // 3) If still missing and NOT internal call, resolve once via /tenants/current
        if (!tenantSlug && !internal) {
          const resolved = await resolveTenantSlugViaCurrent(req);
          if (resolved) {
            tenantSlug = resolved;
            headers.set("x-tenant-slug", tenantSlug);
            debugSlugSource = "fetch(tenants/current)";
          }
        }
      }
    }

    const res = NextResponse.next({ request: { headers } });

    // If we resolved slug via fetch, cache it tenantId-bound
    const finalTenantId = (headers.get("x-tenant-id") ?? "").trim();
    const finalTenantSlug = (headers.get("x-tenant-slug") ?? "").trim();
    if (finalTenantId && finalTenantSlug && debugSlugSource === "fetch(tenants/current)") {
      res.cookies.set(TENANT_CTX_COOKIE, `${finalTenantId}|${finalTenantSlug}`, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
    }

    // DEV debug headers
    if (process.env.NODE_ENV !== "production") {
      res.headers.set("x-debug-mw-token", token ? "1" : "0");
      res.headers.set("x-debug-mw-cookieNameUsed", cookieNameUsed ?? "");
      res.headers.set("x-debug-mw-cookieNames", cookieNames.join(","));
      res.headers.set("x-debug-mw-host", req.headers.get("host") ?? "");
      res.headers.set("x-debug-mw-path", pathname);
      res.headers.set("x-debug-mw-method", req.method);
      res.headers.set("x-debug-mw-tenantSlugSource", debugSlugSource);
      res.headers.set("x-debug-mw-internal", internal ? "1" : "0");
    }

    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
