import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { proxy } from "./src/proxy";

function isDev() {
  return process.env.NODE_ENV !== "production";
}

function getCookie(req: NextRequest, name: string): string {
  return req.cookies.get(name)?.value?.trim() ?? "";
}

function hasTenantCookie(req: NextRequest) {
  return (
    Boolean(getCookie(req, "x-tenant-slug")) ||
    Boolean(getCookie(req, "tenantSlug")) ||
    Boolean(getCookie(req, "tenant_slug")) ||
    Boolean(getCookie(req, "lr-tenant-slug"))
  );
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // MVP: Mobile API soll nicht durch Admin/Tenant Proxy-Regeln laufen.
  if (pathname.startsWith("/api/mobile/")) {
    return NextResponse.next();
  }

  const devSlug = (process.env.DEV_TENANT_SLUG || "atlex").trim();

  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const hasHeaderSlug = Boolean(req.headers.get("x-tenant-slug")?.trim());
  const hasHeaderId = Boolean(req.headers.get("x-tenant-id")?.trim());
  const hasCookie = hasTenantCookie(req);

  // ✅ DEV-only: For /admin page requests, inject x-tenant-slug directly into the request.
  // Browser page requests don't send custom headers; this guarantees tenant context for Server Components.
  if (isDev() && isAdmin && req.method === "GET" && !hasHeaderSlug && !hasHeaderId && !hasCookie) {
    const headers = new Headers(req.headers);
    headers.set("x-tenant-slug", devSlug);

    const res = NextResponse.next({
      request: { headers },
    });

    // Also persist it for subsequent requests (best effort)
    res.cookies.set("x-tenant-slug", devSlug, {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });

    return res;
  }

  // Everything else follows existing proxy rules
  const res = await proxy(req);

  // Best-effort DEV cookie persistence if missing (helps /api calls too)
  if (isDev() && !hasCookie) {
    res.cookies.set("x-tenant-slug", devSlug, {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });
  }

  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
