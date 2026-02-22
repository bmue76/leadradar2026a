import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { proxy } from "./src/proxy";

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // MVP: Mobile API soll nicht durch Admin/Tenant Proxy-Regeln laufen.
  // Mobile auth läuft über Body (redeem) bzw. x-api-key (license).
  if (pathname.startsWith("/api/mobile/")) {
    return NextResponse.next();
  }

  return proxy(req);
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
