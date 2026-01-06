import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody, httpError } from "@/lib/http";
import { requireTenantContext } from "@/lib/tenantContext";
import { prisma } from "@/lib/prisma";

const BodySchema = z.object({
  formIds: z.array(z.string().min(1)).max(500),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: deviceId } = await ctx.params;
    const t = await requireTenantContext(req);
    const body = await validateBody(req, BodySchema);

    const device = await prisma.mobileDevice.findFirst({
      where: { id: deviceId, tenantId: t.tenantId },
      select: { id: true },
    });
    if (!device) throw httpError(404, "NOT_FOUND", "Device not found.");

    // Ensure all forms belong to this tenant (admin scope; safe to return 404 here)
    if (body.formIds.length > 0) {
      const count = await prisma.form.count({
        where: { tenantId: t.tenantId, id: { in: body.formIds } },
      });
      if (count !== body.formIds.length) {
        throw httpError(404, "NOT_FOUND", "One or more forms not found.");
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.mobileDeviceForm.deleteMany({
        where: { tenantId: t.tenantId, deviceId },
      });

      if (body.formIds.length > 0) {
        await tx.mobileDeviceForm.createMany({
          data: body.formIds.map((formId) => ({
            tenantId: t.tenantId,
            deviceId,
            formId,
          })),
          skipDuplicates: true,
        });
      }
    });

    return jsonOk(req, { id: deviceId, assignedFormIds: body.formIds });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
