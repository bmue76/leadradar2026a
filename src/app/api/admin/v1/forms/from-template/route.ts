import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

import { readTemplateMeta, stripTemplateMeta } from "@/lib/templates/shared";

export const runtime = "nodejs";

const IdSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i);

const BodySchema = z.object({
  templateId: IdSchema,
  name: z.string().trim().min(1).max(200).optional(),
});

function toNullableJsonInput(
  v: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (v === undefined) return undefined;
  if (v === null) return Prisma.DbNull;
  return v as Prisma.InputJsonValue;
}

export async function POST(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const body = await validateBody(req, BodySchema);

    const template = await prisma.form.findFirst({
      where: { id: body.templateId, tenantId },
      include: { fields: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });

    if (!template) throw httpError(404, "NOT_FOUND", "Template not found.");

    const meta = readTemplateMeta(template.config);
    if (!meta.isTemplate) {
      throw httpError(400, "NOT_A_TEMPLATE", "Selected form is not marked as a template.");
    }

    const newName = body.name ?? `${template.name} (copy)`;
    const nextConfig = stripTemplateMeta(template.config);

    const created = await prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          tenantId,
          name: newName,
          description: template.description ?? null,
          status: "DRAFT",
          config: toNullableJsonInput(nextConfig),
        },
        select: { id: true },
      });

      if (template.fields.length > 0) {
        await tx.formField.createMany({
          data: template.fields.map((f) => ({
            tenantId,
            formId: form.id,
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            isActive: f.isActive,
            sortOrder: f.sortOrder,
            placeholder: f.placeholder,
            helpText: f.helpText,
            config: toNullableJsonInput(f.config),
          })),
        });
      }

      return form;
    });

    return jsonOk(req, { formId: created.id });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
