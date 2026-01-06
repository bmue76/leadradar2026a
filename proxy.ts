import { NextRequest, NextResponse } from "next/server";

function getTraceId(req: NextRequest): string {
  return req.headers.get("x-trace-id") ?? crypto.randomUUID();
}

function base64UrlDecode(input: string): string {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

type SessionLike = {
  uid: string;
  tid: string;
  exp?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function toCleanString(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "null") return "";
  return s;
}

function readSessionFromCookie(req: NextRequest): SessionLike | null {
  // Cookie-Name muss zum Login passen (src/lib/auth.ts).
  const AUTH_COOKIE_NAME = "lr_session";

  const raw = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!raw) return null;

  // Erwartetes Format: "<base64url(json)>.<sig>"
  const payloadPart = raw.split(".")[0];
  if (!payloadPart) return null;

  try {
    const json = base64UrlDecode(payloadPart);
    const parsed: unknown = JSON.parse(json);
    const obj = asRecord(parsed);
    if (!obj) return null;

    // auth.ts payload uses { sub, tid, role, iat, exp }
    const uid = toCleanString(obj.uid ?? obj.sub ?? obj.userId);
    const tid = toCleanString(obj.tid ?? obj.tenantId);

    // Hard rule: we require BOTH userId and tenantId for admin area.
    // If tid is missing/null, treat as unauthenticated for admin scope to avoid poisoning headers.
    if (!uid || !tid) return null;

    const exp = typeof obj.exp === "number" ? obj.exp : undefined;

    return { uid, tid, exp };
  } catch {
    return null;
  }
}

export function proxy(req: NextRequest) {
  const traceId = getTraceId(req);
  const url = req.nextUrl;

  const isAdminApi = url.pathname.startsWith("/api/admin/");
  const isAdminUi = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
  const isLogin = url.pathname === "/login";

  // Login-Seite nie blocken
  if (isLogin) return NextResponse.next();

  // Nur Admin schützen
  if (!isAdminApi && !isAdminUi) return NextResponse.next();

  const session = readSessionFromCookie(req);

  if (!session) {
    if (isAdminApi) {
      return new NextResponse(
        JSON.stringify({
          ok: false,
          error: { code: "UNAUTHENTICATED", message: "Not authenticated." },
          traceId,
        }),
        { status: 401, headers: { "content-type": "application/json", "x-trace-id": traceId } }
      );
    }

    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", url.pathname);
    const res = NextResponse.redirect(loginUrl);
    res.headers.set("x-trace-id", traceId);
    return res;
  }

  // Optional: Expiry prüfen
  if (typeof session.exp === "number" && Date.now() / 1000 > session.exp) {
    if (isAdminApi) {
      return new NextResponse(
        JSON.stringify({
          ok: false,
          error: { code: "UNAUTHENTICATED", message: "Session expired." },
          traceId,
        }),
        { status: 401, headers: { "content-type": "application/json", "x-trace-id": traceId } }
      );
    }

    const res = NextResponse.redirect(new URL("/login", req.url));
    res.headers.set("x-trace-id", traceId);
    return res;
  }

  // Headers für App-Routes / API
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-trace-id", traceId);
  requestHeaders.set("x-user-id", session.uid);
  requestHeaders.set("x-tenant-id", session.tid);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/login"],
};
