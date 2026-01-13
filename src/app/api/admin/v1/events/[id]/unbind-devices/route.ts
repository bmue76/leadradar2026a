import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenantContext";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const { tenantId } = await requireTenantContext(req);
    const { id } = await ctx.params;

    // leak-safe event existence
    const ev = await prisma.event.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!ev) throw httpError(404, "NOT_FOUND", "Not found.");

    const unbindRes = await prisma.mobileDevice.updateMany({
      where: { tenantId, activeEventId: id },
      data: { activeEventId: null },
    });

    return jsonOk(req, { eventId: id, unboundDevicesCount: unbindRes.count });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
