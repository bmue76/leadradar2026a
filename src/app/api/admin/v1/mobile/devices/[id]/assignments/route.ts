import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenantContext";
import { z } from "zod";

export const runtime = "nodejs";

const PutAssignmentsBody = z.object({
  formIds: z.array(z.string().trim().min(1)).max(200),
});

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  try {
    const { tenantId } = await requireTenantContext(req);
    const deviceId = (ctx.params.id ?? "").trim();
    if (!deviceId) throw httpError(404, "NOT_FOUND", "Not found.");

    const body = await validateBody(req, PutAssignmentsBody);
    const formIds = Array.from(new Set(body.formIds.map((s) => s.trim()).filter(Boolean)));

    const device = await prisma.mobileDevice.findFirst({
      where: { id: deviceId, tenantId },
      select: { id: true },
    });
    if (!device) throw httpError(404, "NOT_FOUND", "Not found.");

    if (formIds.length > 0) {
      const found = await prisma.form.findMany({
        where: { tenantId, id: { in: formIds } },
        select: { id: true },
      });
      const foundIds = new Set(found.map((f) => f.id));
      const missing = formIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) throw httpError(404, "NOT_FOUND", "Not found.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.mobileDeviceForm.deleteMany({
        where: { tenantId, deviceId },
      });

      if (formIds.length > 0) {
        await tx.mobileDeviceForm.createMany({
          data: formIds.map((formId) => ({ tenantId, deviceId, formId })),
        });
      }
    });

    const assigned = await prisma.mobileDeviceForm.findMany({
      where: { tenantId, deviceId },
      orderBy: { assignedAt: "desc" },
      select: {
        form: { select: { id: true, name: true, status: true, createdAt: true } },
        assignedAt: true,
      },
      take: 500,
    });

    return jsonOk(req, {
      deviceId,
      assignedForms: assigned.map((a) => ({
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
