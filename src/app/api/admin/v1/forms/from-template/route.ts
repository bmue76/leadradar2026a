import { z } from "zod";
import { FormStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";
import { getFormTemplate } from "@/lib/formTemplates";

export const runtime = "nodejs";

const BodySchema = z.object({
  templateKey: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const body = await validateBody(req, BodySchema);

    const template = getFormTemplate(body.templateKey);
    if (!template) throw httpError(404, "NOT_FOUND", "Not found.");

    const name = body.name?.trim().length ? body.name.trim() : template.name;

    const created = await prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          tenantId,
          name,
          description: template.description ?? undefined,
          status: FormStatus.DRAFT,
        },
        select: { id: true },
      });

      if (template.fields.length) {
        await tx.formField.createMany({
          data: template.fields.map((f) => ({
            tenantId,
            formId: form.id,
            key: f.key,
            label: f.label,
            type: f.type,
            required: Boolean(f.required),
            isActive: true,
            sortOrder: f.sortOrder,
            placeholder: f.placeholder ?? null,
            helpText: f.helpText ?? null,
            config: (f.config ?? undefined) as Prisma.InputJsonValue | undefined,
          })),
        });
      }

      const full = await tx.form.findFirst({
        where: { id: form.id, tenantId },
        include: { fields: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
      });

      return full;
    });

    if (!created) throw httpError(404, "NOT_FOUND", "Not found.");

    return jsonOk(req, created, { status: 201 });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
