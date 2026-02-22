import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { requireAdminAuth } from "@/lib/auth";
import { isHttpError, validateQuery } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const QuerySchema = z.object({
  history: z.enum(["0", "1"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAdminAuth(req);
    const { id: deviceId } = await ctxRoute.params;
    const q = await validateQuery(req, QuerySchema);

    const device = await prisma.mobileDevice.findFirst({
      where: { id: deviceId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!device) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const now = new Date();

    const current = await prisma.deviceLicense.findFirst({
      where: { tenantId: ctx.tenantId, deviceId, status: "ACTIVE" },
      orderBy: { endsAt: "desc" },
      select: {
        id: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        createdByUserId: true,
        note: true,
        stripeCheckoutSessionId: true,
      },
    });

    const isActive = !!(current && current.status === "ACTIVE" && current.endsAt > now);

    const includeHistory = q.history === "1";
    const limit = q.limit ?? 25;

    const history = includeHistory
      ? await prisma.deviceLicense.findMany({
          where: { tenantId: ctx.tenantId, deviceId },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            id: true,
            type: true,
            status: true,
            startsAt: true,
            endsAt: true,
            createdAt: true,
            createdByUserId: true,
            note: true,
            stripeCheckoutSessionId: true,
          },
        })
      : null;

    return jsonOk(req, {
      deviceId,
      current: current
        ? {
            id: current.id,
            type: current.type,
            status: current.status,
            isActive,
            startsAt: current.startsAt.toISOString(),
            endsAt: current.endsAt.toISOString(),
            createdAt: current.createdAt.toISOString(),
            createdByUserId: current.createdByUserId ?? null,
            note: current.note ?? null,
            stripeCheckoutSessionId: current.stripeCheckoutSessionId ?? null,
          }
        : {
            id: null,
            type: null,
            status: null,
            isActive: false,
            startsAt: null,
            endsAt: null,
          },
      history: history
        ? history.map((h) => ({
            id: h.id,
            type: h.type,
            status: h.status,
            startsAt: h.startsAt.toISOString(),
            endsAt: h.endsAt.toISOString(),
            createdAt: h.createdAt.toISOString(),
            createdByUserId: h.createdByUserId ?? null,
            note: h.note ?? null,
            stripeCheckoutSessionId: h.stripeCheckoutSessionId ?? null,
          }))
        : undefined,
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
