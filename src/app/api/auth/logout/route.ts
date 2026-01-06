import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function makeTraceId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `trace_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function expireCookie(name: string) {
  cookies().set({
    name,
    value: "",
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}

export async function POST() {
  const traceId = makeTraceId();

  // Clear common session cookie names (adjust if your actual name differs).
  for (const name of [
    "lr_session",
    "leadradar_session",
    "session",
    "session_id",
    "lr_admin_session",
  ]) {
    expireCookie(name);
  }

  const res = NextResponse.json(
    { ok: true, data: { loggedOut: true }, traceId },
    { status: 200 }
  );
  res.headers.set("x-trace-id", traceId);
  res.headers.set("cache-control", "no-store, must-revalidate");
  return res;
}
