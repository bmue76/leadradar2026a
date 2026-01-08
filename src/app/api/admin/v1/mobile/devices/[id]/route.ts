import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenantContext";
import { z } from "zod";

export const runtime = "nodejs";

const PatchDeviceBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

export async function GET(req: Request, ctx: { params: { id: string } }) {
  try {
    const { tenantId } = await requireTenantContext(req);
    const id = (ctx.params.id ?? "").trim();
    if (!id) throw httpError(404, "NOT_FOUND", "Not found.");

    const device = await prisma.mobileDevice.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
        apiKey: { select: { id: true, prefix: true, status: true, lastUsedAt: true } },
        assignments: {
          orderBy: { assignedAt: "desc" },
          select: {
            form: { select: { id: true, name: true, status: true, createdAt: true } },
            assignedAt: true,
          },
        },
      },
    });

    if (!device) throw httpError(404, "NOT_FOUND", "Not found.");

    return jsonOk(req, {
      device: {
        id: device.id,
        name: device.name,
        status: device.status,
        lastSeenAt: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
        createdAt: device.createdAt.toISOString(),
        apiKey: {
          id: device.apiKey.id,
          prefix: device.apiKey.prefix,
          status: device.apiKey.status,
          lastUsedAt: device.apiKey.lastUsedAt ? device.apiKey.lastUsedAt.toISOString() : null,
        },
      },
      assignedForms: device.assignments.map((a) => ({
        id: a.form.id,
        name: a.form.name,
        status: a.form.status,
        createdAt: a.form.createdAt.toISOString(),
        assignedAt: a.assignedAt.toISOString(),
      })),
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const { tenantId } = await requireTenantContext(req);
    const id = (ctx.params.id ?? "").trim();
    if (!id) throw httpError(404, "NOT_FOUND", "Not found.");

    const body = await validateBody(req, PatchDeviceBody);

    const existing = await prisma.mobileDevice.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) throw httpError(404, "NOT_FOUND", "Not found.");

    const updated = await prisma.mobileDevice.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
        apiKey: { select: { id: true, prefix: true, status: true, lastUsedAt: true } },
      },
    });

    return jsonOk(req, {
      device: {
        id: updated.id,
        name: updated.name,
        status: updated.status,
        lastSeenAt: updated.lastSeenAt ? updated.lastSeenAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
        apiKey: {
          id: updated.apiKey.id,
          prefix: updated.apiKey.prefix,
          status: updated.apiKey.status,
          lastUsedAt: updated.apiKey.lastUsedAt ? updated.apiKey.lastUsedAt.toISOString() : null,
        },
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
