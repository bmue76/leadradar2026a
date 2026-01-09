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
  })
  .refine((v) => typeof v.name === "string" || typeof v.status === "string", {
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

    return jsonOk(req, res);
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

    await prisma.mobileDevice.updateMany({
      where: { id, tenantId },
      data: {
        ...(typeof body.name === "string" ? { name: body.name } : {}),
        ...(typeof body.status === "string" ? { status: body.status } : {}),
      },
    });

    const res = await loadDevice(tenantId, id);
    if (!res) throw httpError(404, "NOT_FOUND", "Not found.");

    return jsonOk(req, { device: res.device });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
