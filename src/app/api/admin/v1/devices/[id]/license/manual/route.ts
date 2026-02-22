import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { requireAdminAuth } from "@/lib/auth";
import { isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const BodySchema = z.object({
  type: z.enum(["FAIR_30D", "YEAR_365D"]),
  daysOverride: z.coerce.number().int().min(1).max(3650).optional(),
  note: z.string().max(200).optional(),
});

type AdminCtx = { tenantId: string; userId?: string };

function addDaysUtc(d: Date, days: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function defaultDays(type: "FAIR_30D" | "YEAR_365D"): number {
  return type === "FAIR_30D" ? 30 : 365;
}

async function requireOwner(ctx: AdminCtx) {
  if (!ctx.userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true, role: true, tenantId: true },
  });
  if (!user) return false;
  if (user.tenantId !== ctx.tenantId) return false;
  return user.role === "TENANT_OWNER";
}

export async function POST(req: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  try {
    const ctx = (await requireAdminAuth(req)) as AdminCtx;
    const { id: deviceId } = await ctxRoute.params;
    const body = await validateBody(req, BodySchema);

    const isOwner = await requireOwner(ctx);
    if (!isOwner) return jsonError(req, 403, "FORBIDDEN", "Owner only.");

    const device = await prisma.mobileDevice.findFirst({
      where: { id: deviceId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!device) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const now = new Date();

    const current = await prisma.deviceLicense.findFirst({
      where: { tenantId: ctx.tenantId, deviceId, status: "ACTIVE" },
      orderBy: { endsAt: "desc" },
      select: { endsAt: true },
    });

    const base = current?.endsAt && current.endsAt > now ? current.endsAt : now;
    const startsAt = base;

    const days = body.daysOverride ?? defaultDays(body.type);
    const endsAt = addDaysUtc(base, days);

    const row = await prisma.deviceLicense.create({
      data: {
        tenantId: ctx.tenantId,
        deviceId,
        type: body.type,
        status: "ACTIVE",
        startsAt,
        endsAt,
        createdByUserId: ctx.userId ?? null,
        note: body.note ?? "manual",
      },
      select: { id: true, endsAt: true, startsAt: true, type: true, status: true },
    });

    return jsonOk(req, {
      deviceId,
      license: {
        id: row.id,
        type: row.type,
        status: row.status,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
