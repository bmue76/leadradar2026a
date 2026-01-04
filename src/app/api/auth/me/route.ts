import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const current = await getCurrentUserFromRequest(req);
  if (!current) {
    return NextResponse.json({ ok: true, data: null });
  }

  const { user, tenant } = current;
  return NextResponse.json({
    ok: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      tenant: tenant
        ? { id: tenant.id, slug: tenant.slug, name: tenant.name, country: tenant.country }
        : null,
    },
  });
}
