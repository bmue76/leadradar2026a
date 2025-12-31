import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { requireTenantContext } from "@/lib/auth";

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

const ReorderFieldsSchema = z.object({
  order: z
    .array(IdSchema)
    .min(1)
    .refine((arr) => new Set(arr).size === arr.length, "order must not contain duplicates"),
});

export async function POST(req: Request, ctx: unknown) {
  try {
    const tenant = await requireTenantContext(req);
    const { id: formId } = await getParams<{ id: string }>(ctx);

    if (!IdSchema.safeParse(formId).success) throw httpError(404, "NOT_FOUND", "Not found.");

    const body = await validateBody(req, ReorderFieldsSchema);

    const form = await prisma.form.findFirst({
      where: { id: formId, tenantId: tenant.id },
      select: { id: true },
    });
    if (!form) throw httpError(404, "NOT_FOUND", "Not found.");

    const existing = await prisma.formField.findMany({
      where: { tenantId: tenant.id, formId },
      select: { id: true },
    });

    const existingIds = existing.map((f) => f.id);
    const wantIds = body.order;

    // leak-safe: mismatch => 404
    if (existingIds.length !== wantIds.length) throw httpError(404, "NOT_FOUND", "Not found.");

    const existingSet = new Set(existingIds);
    for (const id of wantIds) {
      if (!existingSet.has(id)) throw httpError(404, "NOT_FOUND", "Not found.");
    }

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < wantIds.length; i++) {
        const id = wantIds[i]!;
        const res = await tx.formField.updateMany({
          where: { id, tenantId: tenant.id, formId },
          data: { sortOrder: i },
        });
        if (res.count === 0) throw httpError(404, "NOT_FOUND", "Not found.");
      }
    });

    const fields = await prisma.formField.findMany({
      where: { tenantId: tenant.id, formId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return jsonOk(req, { fields });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
