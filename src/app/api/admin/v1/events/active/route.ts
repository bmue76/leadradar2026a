import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenantContext";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const admin = await requireAdminAuth(req);
    await requireTenantContext(req); // leak-safe header/session mismatch check

    const items = await prisma.event.findMany({
      where: { tenantId: admin.tenantId, status: "ACTIVE" },
      orderBy: [{ startsAt: "desc" }, { updatedAt: "desc" }],
      take: 500,
      select: {
        id: true,
        name: true,
        location: true,
        startsAt: true,
        endsAt: true,
        status: true,
        updatedAt: true,
      },
    });

    return jsonOk(req, { items });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_SERVER_ERROR", "Unexpected server error.");
  }
}
