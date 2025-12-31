import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const tenant = await requireTenantContext(req);

    const email = req.headers.get("x-user-email")?.trim().toLowerCase();
    if (!email) {
      throw httpError(401, "UNAUTHENTICATED", "User context required (x-user-email header).", {
        header: "x-user-email",
      });
    }

    const user = await prisma.user.findFirst({
      where: { tenantId: tenant.id, email },
    });

    if (!user) throw httpError(404, "NOT_FOUND", "Not found.");

    return jsonOk(req, {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
      },
      devNote: "This endpoint is DEV-only (header based). Replace with Auth.js later.",
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
