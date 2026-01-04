import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Security best-practice: always return ok (don't leak user existence)
  await req.json().catch(() => null);
  return NextResponse.json({
    ok: true,
    message: "Falls die E-Mail existiert, wurde eine Nachricht versendet (Feature folgt später).",
  });
}
