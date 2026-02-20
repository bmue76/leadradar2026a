import { NextResponse } from "next/server";

type CtxData = {
  method: string;
  pathname: string;
  headers: {
    "x-tenant-slug": string | null;
    "x-tenant-id": string | null;
    "x-user-id": string | null;
    "x-admin-user-id": string | null;
    "x-user-role": string | null;
    "x-mw-internal": string | null;
  };
  host: string | null;
  cookieNames: string[];
  now: string;
};

function newTraceId(): string {
  return crypto.randomUUID();
}

function json(status: number, payload: unknown, traceId: string) {
  const res = NextResponse.json(payload, { status });
  res.headers.set("x-trace-id", traceId);
  res.headers.set("cache-control", "no-store");
  return res;
}

function getHeader(req: Request, name: string): string | null {
  const v = req.headers.get(name);
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function parseCookieNames(cookieHeader: string | null): string[] {
  const raw = (cookieHeader ?? "").trim();
  if (!raw) return [];
  return raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split("=")[0]?.trim())
    .filter((n): n is string => Boolean(n));
}

async function handle(req: Request) {
  const traceId = newTraceId();

  // DEV-only (PROD: 404)
  if (process.env.NODE_ENV === "production") {
    return json(
      404,
      {
        ok: false,
        error: { code: "NOT_FOUND", message: "Not found." },
        traceId,
      },
      traceId
    );
  }

  const url = new URL(req.url);
  const cookieHeader = req.headers.get("cookie");

  const data: CtxData = {
    method: req.method,
    pathname: url.pathname,
    headers: {
      "x-tenant-slug": getHeader(req, "x-tenant-slug"),
      "x-tenant-id": getHeader(req, "x-tenant-id"),
      "x-user-id": getHeader(req, "x-user-id"),
      "x-admin-user-id": getHeader(req, "x-admin-user-id"),
      "x-user-role": getHeader(req, "x-user-role"),
      "x-mw-internal": getHeader(req, "x-mw-internal"),
    },
    host: req.headers.get("host"),
    cookieNames: parseCookieNames(cookieHeader),
    now: new Date().toISOString(),
  };

  return json(
    200,
    {
      ok: true,
      data,
      traceId,
    },
    traceId
  );
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
