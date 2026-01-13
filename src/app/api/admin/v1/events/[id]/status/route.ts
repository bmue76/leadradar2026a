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
    const tenantId = admin.tenantId;

    const result = await prisma.$transaction(async (tx) => {
      // Leak-safe existence check (tenant-scoped)
      const current = await tx.event.findFirst({
        where: { id, tenantId },
        select: { id: true, status: true },
      });
      if (!current) throw httpError(404, "NOT_FOUND", "Not found.");

      let autoArchivedEventId: string | null = null;
      let devicesUnboundCount = 0;

      if (body.status === "ACTIVE") {
        // Guardrail 1 (MVP): at most 1 ACTIVE per tenant
        // -> auto-archive any other ACTIVE event (tenant-scoped)
        const otherActive = await tx.event.findFirst({
          where: { tenantId, status: "ACTIVE", NOT: { id } },
          select: { id: true },
          orderBy: { updatedAt: "desc" },
        });

        if (otherActive) {
          autoArchivedEventId = otherActive.id;

          await tx.event.update({
            where: { id: otherActive.id },
            data: { status: "ARCHIVED" },
          });

          const unbind = await tx.mobileDevice.updateMany({
            where: { tenantId, activeEventId: otherActive.id },
            data: { activeEventId: null },
          });
          devicesUnboundCount += unbind.count;
        }

        // activate target event
        await tx.event.update({
          where: { id },
          data: { status: "ACTIVE" },
        });
      } else {
        // If event becomes non-ACTIVE (DRAFT/ARCHIVED), unbind devices from it
        await tx.event.update({
          where: { id },
          data: { status: body.status },
        });

        const unbind = await tx.mobileDevice.updateMany({
          where: { tenantId, activeEventId: id },
          data: { activeEventId: null },
        });
        devicesUnboundCount += unbind.count;
      }

      const item = await tx.event.findFirst({
        where: { id, tenantId },
        select: {
          id: true,
          name: true,
          status: true,
          updatedAt: true,
        },
      });
      if (!item) throw httpError(404, "NOT_FOUND", "Not found.");

      return { item, autoArchivedEventId, devicesUnboundCount };
    });

    return jsonOk(req, result);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_SERVER_ERROR", "Unexpected server error.");
  }
}
