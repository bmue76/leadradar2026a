import { z } from "zod";
import { FormStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
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

const SetFormStatusSchema = z.object({
  status: z.nativeEnum(FormStatus),
});

export async function PATCH(req: Request, ctx: unknown) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const { id } = await getParams<{ id: string }>(ctx);

    if (!IdSchema.safeParse(id).success) throw httpError(404, "NOT_FOUND", "Not found.");

    const body = await validateBody(req, SetFormStatusSchema);

    const res = await prisma.form.updateMany({
      where: { id, tenantId },
      data: { status: body.status },
    });

    if (res.count === 0) throw httpError(404, "NOT_FOUND", "Not found.");

    const updated = await prisma.form.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        tenantId: true,
        name: true,
        description: true,
        status: true,
        config: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!updated) throw httpError(404, "NOT_FOUND", "Not found.");
    return jsonOk(req, updated);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
