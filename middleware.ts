import type { NextRequest } from "next/server";
import { proxy, config as proxyConfig } from "./src/proxy";

// Wrapper: hält Root-Middleware kompatibel, Logic lebt in src/proxy.ts
export async function middleware(req: NextRequest) {
  return proxy(req);
}

export const config = proxyConfig;
