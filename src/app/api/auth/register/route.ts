import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setAuthCookie } from "@/lib/auth";
import { hashPasswordScrypt } from "@/lib/password";

export const runtime = "nodejs";

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const tenantName = String(body.tenantName ?? "").trim();
  const country = String(body.country ?? "").trim().toUpperCase(); // "CH"
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const firstName = String(body.firstName ?? "").trim() || null;
  const lastName = String(body.lastName ?? "").trim(); // schema: required

  if (!tenantName || !country || !email || !password || !lastName) {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_REQUEST", message: "Bitte alle Pflichtfelder ausfüllen." } },
      { status: 400 }
    );
  }

  const slug = slugify(String(body.slug ?? "")) || slugify(tenantName) || `tenant-${Date.now()}`;

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    return NextResponse.json(
      { ok: false, error: { code: "EMAIL_TAKEN", message: "Diese E-Mail ist bereits registriert." } },
      { status: 409 }
    );
  }

  const existingSlug = await prisma.tenant.findUnique({ where: { slug } });
  if (existingSlug) {
    return NextResponse.json(
      { ok: false, error: { code: "SLUG_TAKEN", message: "Dieser Firmen-Slug ist bereits vergeben." } },
      { status: 409 }
    );
  }

  const passwordHash = await hashPasswordScrypt(password);

  const tenant = await prisma.tenant.create({
    data: { name: tenantName, slug, country },
  });

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      role: "OWNER",
      passwordHash,
      firstName,
      lastName,
      emailVerified: new Date(), // dev-friendly; später Email-Verify Flow
    },
  });

  const token = createSessionToken({ userId: user.id, tenantId: tenant.id, role: user.role });
  const res = NextResponse.json({ ok: true, data: { tenantId: tenant.id, userId: user.id } });
  setAuthCookie(res, token);
  return res;
}
