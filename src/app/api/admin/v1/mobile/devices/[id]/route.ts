import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenantContext";
import { NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    status: z.enum(["ACTIVE", "DISABLED"]).optional(),
    activeEventId: z.string().trim().min(1).optional().nullable(), // NEW (null => clear)
  })
  .refine((v) => typeof v.name === "string" || typeof v.status === "string" || v.activeEventId !== undefined, {
    message: "At least one field must be provided.",
  });

function flattenDeviceResponse(res: {
  device: {
    id: string;
    name: string;
    status: string;
    lastSeenAt: Date | null;
    createdAt: Date;
    activeEventId: string | null;
    activeEvent: { id: string; name: string; status: string } | null;
    apiKey: { id: string; prefix: string; status: string; lastUsedAt: Date | null };
  };
  assignedForms: Array<{ id: string; name: string; status: string; createdAt: Date; assignedAt: Date }>;
}) {
  const d = res.device;
  return {
    ...d,
    apiKeyPrefix: d.apiKey?.prefix ?? null,
    assignedForms: res.assignedForms,
  };
}

async function loadDevice(tenantId: string, deviceId: string) {
  const device = await prisma.mobileDevice.findFirst({
    where: { id: deviceId, tenantId },
    select: {
      id: true,
      name: true,
      status: true,
      lastSeenAt: true,
      createdAt: true,

      activeEventId: true,
      activeEvent: { select: { id: true, name: true, status: true } },

      apiKey: { select: { id: true, prefix: true, status: true, lastUsedAt: true } },
    },
  });

  if (!device) return null;

  const assigned = await prisma.mobileDeviceForm.findMany({
    where: { tenantId, deviceId },
    select: {
      assignedAt: true,
      form: { select: { id: true, name: true, status: true, createdAt: true } },
    },
    orderBy: [{ assignedAt: "desc" }],
    take: 500,
  });

  const assignedForms = assigned.map((a) => ({
    id: a.form.id,
    name: a.form.name,
    status: a.form.status,
    createdAt: a.form.createdAt,
    assignedAt: a.assignedAt,
  }));

  return { device, assignedForms };
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  try {
    const { tenantId } = await requireTenantContext(req);
    const { id } = await ctx.params;

    const res = await loadDevice(tenantId, id);
    if (!res) throw httpError(404, "NOT_FOUND", "Not found.");

    return jsonOk(req, flattenDeviceResponse(res));
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    const { tenantId } = await requireTenantContext(req);
    const { id } = await ctx.params;

    const body = await validateBody(req, PatchBody);

    // Leak-safe existence check
    const exists = await prisma.mobileDevice.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!exists) throw httpError(404, "NOT_FOUND", "Not found.");

    // If activeEventId is provided as string: verify event belongs to tenant (leak-safe)
    if (typeof body.activeEventId === "string") {
      const ev = await prisma.event.findFirst({
        where: { id: body.activeEventId, tenantId },
        select: { id: true },
      });
      if (!ev) throw httpError(404, "NOT_FOUND", "Not found.");
    }

    await prisma.mobileDevice.updateMany({
      where: { id, tenantId },
      data: {
        ...(typeof body.name === "string" ? { name: body.name } : {}),
        ...(typeof body.status === "string" ? { status: body.status } : {}),
        ...(body.activeEventId !== undefined ? { activeEventId: body.activeEventId } : {}),
      },
    });

    const res = await loadDevice(tenantId, id);
    if (!res) throw httpError(404, "NOT_FOUND", "Not found.");

    return jsonOk(req, flattenDeviceResponse(res));
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
