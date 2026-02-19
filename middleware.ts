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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always ignore Next internals
  if (pathname.startsWith("/_next")) return NextResponse.next();
  if (pathname === "/favicon.ico") return NextResponse.next();

  // We only care about Admin UI + Admin API (v1 and future)
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

  // Admin API: inject / passthrough headers for ALL METHODS (GET/POST/PATCH/DELETE)
  if (isAdminApi) {
    const headers = new Headers(req.headers);

    // Preserve existing values (client may explicitly set overrides in DEV)
    const existingUserId = (headers.get("x-user-id") || headers.get("x-admin-user-id") || "").trim();
    const existingTenantId = (headers.get("x-tenant-id") || "").trim();
    const existingTenantSlug = (headers.get("x-tenant-slug") || "").trim();
    const existingRole = (headers.get("x-user-role") || "").trim();

    // If client already provided x-user-id, ensure alias header exists too
    if (existingUserId) {
      headers.set("x-user-id", existingUserId);
      headers.set("x-admin-user-id", existingUserId);
    }

    if (token) {
      // Be liberal in claim keys (prevents "token exists but headers empty")
      const userId =
        existingUserId ||
        readClaim(token, ["uid", "sub", "userId", "id"]);

      const tenantId =
        existingTenantId ||
        readClaim(token, ["tenantId", "tid"]);

      const tenantSlug =
        existingTenantSlug ||
        readClaim(token, ["tenantSlug", "tslug", "tenant_slug", "slug"]);

      const role =
        existingRole ||
        readClaim(token, ["role", "userRole"]) ||
        "TENANT_OWNER";

      if (userId) {
        headers.set("x-user-id", userId);
        headers.set("x-admin-user-id", userId); // alias for endpoints that check x-admin-user-id
      }
      if (tenantId) headers.set("x-tenant-id", tenantId);
      if (tenantSlug) headers.set("x-tenant-slug", tenantSlug);
      if (role) headers.set("x-user-role", role);
    }

    const res = NextResponse.next({ request: { headers } });

    // DEV-only debug response headers so we can see if middleware sees the session
    if (process.env.NODE_ENV !== "production") {
      res.headers.set("x-debug-mw-token", token ? "1" : "0");
      res.headers.set("x-debug-mw-cookieNameUsed", cookieNameUsed ?? "");
      res.headers.set("x-debug-mw-cookieNames", cookieNames.join(","));
      res.headers.set("x-debug-mw-host", req.headers.get("host") ?? "");
      res.headers.set("x-debug-mw-path", pathname);
      res.headers.set("x-debug-mw-method", req.method);
    }

    return res;
  }

  return NextResponse.next();
}

export const config = {
  // Precise: only Admin UI + Admin API (covers all methods)
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
