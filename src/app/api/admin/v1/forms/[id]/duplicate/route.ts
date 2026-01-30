import { z } from "zod";
import { Prisma, FormStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const IdSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i);

function isPromiseLike<T>(v: unknown): v is Promise<T> {
  return (
    typeof v === "object" &&
    v !== null &&
    "then" in v &&
    typeof (v as { then?: unknown }).then === "function"
  );
}

async function getParams<T extends Record<string, string>>(ctx: unknown): Promise<T> {
  const params = (ctx as { params?: unknown })?.params;
  if (isPromiseLike<T>(params)) return await params;
  return params as T;
}

function buildCopyName(name: string): string {
  const base = (name ?? "").trim() || "Formular";
  const suffix = " (Kopie)";
  const max = 200;
  if ((base + suffix).length <= max) return base + suffix;
  const cut = Math.max(1, max - suffix.length);
  return base.slice(0, cut).trimEnd() + suffix;
}

export async function POST(req: Request, ctx: unknown) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const { id } = await getParams<{ id: string }>(ctx);

    if (!IdSchema.safeParse(id).success) throw httpError(404, "NOT_FOUND", "Not found.");

    const source = await prisma.form.findFirst({
      where: { id, tenantId },
      include: { fields: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });

    if (!source) throw httpError(404, "NOT_FOUND", "Not found.");

    const created = await prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          tenantId,
          name: buildCopyName(source.name),
          description: source.description ?? undefined,
          status: FormStatus.DRAFT,
          config: (source.config ?? undefined) as Prisma.InputJsonValue | undefined,
          assignedEventId: null,
        },
        select: {
          id: true,
          name: true,
          status: true,
          assignedEventId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (source.fields.length > 0) {
        await tx.formField.createMany({
          data: source.fields.map((f) => ({
            tenantId,
            formId: form.id,
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            isActive: f.isActive,
            sortOrder: f.sortOrder,
            placeholder: f.placeholder ?? null,
            helpText: f.helpText ?? null,
            config: (f.config ?? undefined) as Prisma.InputJsonValue | undefined,
          })),
        });
      }

      return form;
    });

    return jsonOk(req, { item: created }, { status: 201 });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
