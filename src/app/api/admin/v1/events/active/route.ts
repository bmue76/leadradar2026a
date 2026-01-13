import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenantContext";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantContext(req);

    // Defensive: should be max 1, but if inconsistent, take most recently updated.
    const item = await prisma.event.findFirst({
      where: { tenantId, status: "ACTIVE" },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        tenantId: true,
        name: true,
        location: true,
        startsAt: true,
        endsAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return jsonOk(req, { item: item ?? null });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
