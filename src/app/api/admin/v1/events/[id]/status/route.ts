import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenantContext";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
});

export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const admin = await requireAdminAuth(req);
    await requireTenantContext(req); // leak-safe header/session mismatch check
    const { id } = await ctx.params;

    const body = await validateBody(req, BodySchema);

    const exists = await prisma.event.findFirst({
      where: { id, tenantId: admin.tenantId },
      select: { id: true },
    });
    if (!exists) throw httpError(404, "NOT_FOUND", "Not found.");

    await prisma.event.updateMany({
      where: { id, tenantId: admin.tenantId },
      data: { status: body.status },
    });

    const item = await prisma.event.findFirst({
      where: { id, tenantId: admin.tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
      },
    });
    if (!item) throw httpError(404, "NOT_FOUND", "Not found.");

    return jsonOk(req, { item });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_SERVER_ERROR", "Unexpected server error.");
  }
}
