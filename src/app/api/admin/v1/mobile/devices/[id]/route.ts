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

    // TP 3.3 — Device Binding
    // null => clear binding
    activeEventId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => typeof v.name === "string" || typeof v.status === "string" || v.activeEventId !== undefined, {
    message: "At least one field must be provided.",
  });

async function loadDevice(tenantId: string, deviceId: string) {
  const device = await prisma.mobileDevice.findFirst({
    where: { id: deviceId, tenantId },
    select: {
      id: true,
      name: true,
      status: true,
      lastSeenAt: true,
      createdAt: true,

      // TP 3.3
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

    // Keep response backward-compatible-ish:
    // root device fields + assignedForms
    return jsonOk(req, { ...res.device, assignedForms: res.assignedForms });
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

    // TP 3.6 — Guardrail: Device.activeEventId may only point to ACTIVE events
    // - foreign/unknown eventId (wrong tenant) => 404 NOT_FOUND (leak-safe)
    // - known but not ACTIVE => 409 EVENT_NOT_ACTIVE
    if (body.activeEventId !== undefined) {
      const evId = body.activeEventId;
      if (typeof evId === "string") {
        const ev = await prisma.event.findFirst({
          where: { id: evId, tenantId },
          select: { id: true, status: true },
        });
        if (!ev) throw httpError(404, "NOT_FOUND", "Not found.");
        if (ev.status !== "ACTIVE") throw httpError(409, "EVENT_NOT_ACTIVE", "Event is not ACTIVE.");
      }
    }

    await prisma.mobileDevice.updateMany({
      where: { id, tenantId },
      data: {
        ...(typeof body.name === "string" ? { name: body.name } : {}),
        ...(typeof body.status === "string" ? { status: body.status } : {}),
        ...(body.activeEventId !== undefined ? { activeEventId: body.activeEventId ?? null } : {}),
      },
    });

    const res = await loadDevice(tenantId, id);
    if (!res) throw httpError(404, "NOT_FOUND", "Not found.");

    return jsonOk(req, { ...res.device, assignedForms: res.assignedForms });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
