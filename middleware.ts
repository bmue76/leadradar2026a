import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

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

async function getAnyToken(req: NextRequest) {
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

  if (pathname.startsWith("/_next")) return NextResponse.next();
  if (pathname === "/favicon.ico") return NextResponse.next();
  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  const isAdmin = pathname.startsWith("/admin");
  const isApi = pathname.startsWith("/api");

  if (!isAdmin && !isApi) return NextResponse.next();

  const { token, cookieNames, cookieNameUsed } = await getAnyToken(req);

  // Protect admin pages
  if (isAdmin && !token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isApi) {
    const headers = new Headers(req.headers);

    if (token) {
      const userId = (token as any).uid ?? (token as any).sub;
      const tenantId = (token as any).tenantId ?? (token as any).tid;
      const role = (token as any).role ?? "TENANT_OWNER";

      if (userId) headers.set("x-user-id", String(userId));
      if (tenantId) headers.set("x-tenant-id", String(tenantId));
      if (role) headers.set("x-user-role", String(role));
    }

    const res = NextResponse.next({ request: { headers } });

    // DEV-only debug headers so we can see if middleware sees the session
    if (process.env.NODE_ENV !== "production") {
      res.headers.set("x-debug-mw-token", token ? "1" : "0");
      res.headers.set("x-debug-mw-cookieNameUsed", cookieNameUsed ?? "");
      res.headers.set("x-debug-mw-cookieNames", cookieNames.join(","));
      res.headers.set("x-debug-mw-host", req.headers.get("host") ?? "");
    }

    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
