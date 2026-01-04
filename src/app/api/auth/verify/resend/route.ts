import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmailVerification } from "@/lib/mailer";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}
function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = (body?.email ?? "").toString().trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ ok: false, error: { code: "VALIDATION" } }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerifiedAt: true },
  });

  // Do not leak existence
  if (!user) return NextResponse.json({ ok: true });

  if (user.emailVerifiedAt) return NextResponse.json({ ok: true });

  const rawToken = randomToken();
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

  await prisma.emailVerificationToken.create({
    data: { tokenHash, userId: user.id, expiresAt },
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const verifyUrl = `${appUrl}/api/auth/verify?token=${encodeURIComponent(rawToken)}`;
  await sendEmailVerification(email, verifyUrl);

  return NextResponse.json({ ok: true });
}
