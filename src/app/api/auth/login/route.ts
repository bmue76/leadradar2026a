import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setAuthCookie } from "@/lib/auth";
import { verifyPasswordScrypt } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_REQUEST", message: "E-Mail und Passwort sind erforderlich." } },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Login fehlgeschlagen." } },
      { status: 401 }
    );
  }

  const ok = await verifyPasswordScrypt(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Login fehlgeschlagen." } },
      { status: 401 }
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const token = createSessionToken({ userId: user.id, tenantId: user.tenantId ?? null, role: user.role });
  const res = NextResponse.json({ ok: true, data: { userId: user.id, tenantId: user.tenantId } });
  setAuthCookie(res, token);
  return res;
}
