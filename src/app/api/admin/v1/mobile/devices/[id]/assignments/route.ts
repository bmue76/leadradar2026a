import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenantContext";
import { NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

const PutBody = z.object({
  formIds: z.array(z.string().trim().min(1)).max(500),
});

function dedupePreserveOrder(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = raw.trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  try {
    const { tenantId } = await requireTenantContext(req);
    const { id: deviceId } = await ctx.params;

    const body = await validateBody(req, PutBody);
    const formIds = dedupePreserveOrder(body.formIds);

    const device = await prisma.mobileDevice.findFirst({
      where: { id: deviceId, tenantId },
      select: { id: true },
    });
    if (!device) throw httpError(404, "NOT_FOUND", "Not found.");

    // Validate that all formIds exist in this tenant (leak-safe)
    if (formIds.length > 0) {
      const forms = await prisma.form.findMany({
        where: { tenantId, id: { in: formIds } },
        select: { id: true },
        take: formIds.length,
      });

      if (forms.length !== formIds.length) {
        // leak-safe: do not reveal which form is missing
        throw httpError(404, "NOT_FOUND", "Not found.");
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.mobileDeviceForm.deleteMany({
        where: { tenantId, deviceId },
      });

      if (formIds.length > 0) {
        await tx.mobileDeviceForm.createMany({
          data: formIds.map((formId) => ({ tenantId, deviceId, formId })),
          skipDuplicates: true,
        });
      }
    });

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

    return jsonOk(req, { deviceId, assignedForms });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
