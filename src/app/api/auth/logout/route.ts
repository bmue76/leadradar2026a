import { NextResponse } from "next/server";

import { getTraceId } from "@/lib/api";

export const runtime = "nodejs";

function shouldExpireCookie(name: string): boolean {
  const n = name.toLowerCase();

  // Clear LeadRadar cookies + typical session-related cookies
  if (n.startsWith("lr_")) return true;
  if (n.includes("session")) return true;
  if (n.includes("csrf")) return true;
  if (n.includes("tenant")) return true;

  // keep other cookies untouched
  return false;
}

function parseCookieNames(cookieHeader: string | null): string[] {
  if (!cookieHeader) return [];
  const parts = cookieHeader.split(";");

  const names: string[] = [];
  for (const p of parts) {
    const name = p.split("=")[0]?.trim();
    if (name) names.push(name);
  }
  return Array.from(new Set(names));
}

function expireCookie(res: NextResponse, name: string) {
  res.cookies.set({
    name,
    value: "",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
}

function buildLogoutResponse(req: Request) {
  const traceId = getTraceId(req);

  const res = NextResponse.json({ ok: true, data: { loggedOut: true }, traceId }, { status: 200 });

  res.headers.set("x-trace-id", traceId);
  res.headers.set("Cache-Control", "no-store, must-revalidate");

  // Expire relevant cookies observed on the request
  const cookieNames = parseCookieNames(req.headers.get("cookie"));
  for (const name of cookieNames) {
    if (shouldExpireCookie(name)) expireCookie(res, name);
  }

  // Also expire a few likely candidates (harmless if they don't exist)
  for (const name of ["lr_session", "lr_session_v1", "leadradar_session"]) {
    expireCookie(res, name);
  }

  return res;
}

export async function POST(req: Request) {
  return buildLogoutResponse(req);
}

export async function GET(req: Request) {
  return buildLogoutResponse(req);
}
