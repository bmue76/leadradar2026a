import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPasswordScrypt, sha256Hex } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const token = String(body.token ?? "");
  const newPassword = String(body.newPassword ?? "");

  if (!token || newPassword.length < 8) {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_REQUEST", message: "Ungültiger Token oder Passwort zu kurz." } },
      { status: 400 }
    );
  }

  const tokenHash = sha256Hex(token);

  const prt = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!prt || prt.usedAt || prt.expiresAt <= new Date()) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_TOKEN", message: "Token ist ungültig oder abgelaufen." } },
      { status: 400 }
    );
  }

  const passwordHash = await hashPasswordScrypt(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: prt.userId },
      data: { passwordHash }
    }),
    prisma.passwordResetToken.update({
      where: { id: prt.id },
      data: { usedAt: new Date() }
    })
  ]);

  return NextResponse.json({ ok: true });
}
