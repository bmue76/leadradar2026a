import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function traceId(): string {
  // crypto.randomUUID is available in modern Node + Edge runtimes
  return crypto.randomUUID();
}

function jsonOk(data: unknown) {
  const t = traceId();
  const res = NextResponse.json({ ok: true, data, traceId: t });
  res.headers.set("x-trace-id", t);
  return res;
}

function jsonError(status: number, code: string, message: string) {
  const t = traceId();
  const res = NextResponse.json({ ok: false, error: { code, message }, traceId: t }, { status });
  res.headers.set("x-trace-id", t);
  return res;
}

function snapshot(req: NextRequest) {
  const pick = (k: string) => (req.headers.get(k) ?? "").trim() || null;

  return {
    method: req.method,
    pathname: req.nextUrl.pathname,
    headers: {
      "x-user-id": pick("x-user-id"),
      "x-admin-user-id": pick("x-admin-user-id"),
      "x-user-role": pick("x-user-role"),
      "x-tenant-id": pick("x-tenant-id"),
      "x-tenant-slug": pick("x-tenant-slug"),
    },
    meta: {
      host: pick("host"),
      origin: pick("origin"),
      referer: pick("referer"),
      "user-agent": pick("user-agent"),
    },
  };
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return jsonError(404, "NOT_FOUND", "Not found.");
  }
  return jsonOk(snapshot(req));
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return jsonError(404, "NOT_FOUND", "Not found.");
  }
  return jsonOk(snapshot(req));
}
