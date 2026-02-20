import type { NextRequest } from "next/server";
import { proxy } from "./src/proxy";

export async function middleware(req: NextRequest) {
  return proxy(req);
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
