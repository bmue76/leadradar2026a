import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.redirect(new URL("/login?verified=0", req.url));
  }

  const tokenHash = sha256(token);

  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    select: { userId: true, expiresAt: true },
  });

  if (!record || record.expiresAt.getTime() < Date.now()) {
    return NextResponse.redirect(new URL("/login?verified=0", req.url));
  }

  await prisma.user.update({
    where: { id: record.userId },
    data: { emailVerifiedAt: new Date() },
  });

  await prisma.emailVerificationToken.delete({ where: { tokenHash } });

  return NextResponse.redirect(new URL("/login?verified=1", req.url));
}
