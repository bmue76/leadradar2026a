import { z } from "zod";

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

export async function POST(req: Request, ctx: unknown) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const { id: formId } = await getParams<{ id: string }>(ctx);

    if (!IdSchema.safeParse(formId).success) throw httpError(400, "BAD_REQUEST", "Ungültige Formular-ID.");

    await prisma.$transaction(async (tx) => {
      const form = await tx.form.findFirst({
        where: { id: formId, tenantId },
        select: { id: true },
      });
      if (!form) throw httpError(404, "NOT_FOUND", "Formular nicht gefunden.");

      await tx.formField.deleteMany({ where: { tenantId, formId } });
      await tx.form.delete({ where: { id: formId, tenantId } as any });
    });

    return jsonOk(req, { deleted: true });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
