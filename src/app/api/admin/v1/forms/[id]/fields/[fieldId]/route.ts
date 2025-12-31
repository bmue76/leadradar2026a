import { z } from "zod";
import { Prisma, FieldType } from "@prisma/client";

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

function toNullableJsonInput(
  v: unknown | null | undefined
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (v === undefined) return undefined; // don't update
  if (v === null) return Prisma.DbNull; // clear to DB NULL
  return v as Prisma.InputJsonValue;
}

const FieldKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "key must match /^[a-zA-Z][a-zA-Z0-9_]*$/");

const UpdateFieldSchema = z
  .object({
    key: FieldKeySchema.optional(),
    label: z.string().trim().min(1).max(200).optional(),
    type: z.nativeEnum(FieldType).optional(),
    required: z.boolean().optional(),
    isActive: z.boolean().optional(),
    placeholder: z.string().trim().max(300).nullable().optional(),
    helpText: z.string().trim().max(500).nullable().optional(),
    config: z.unknown().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "No fields to update." });

function prismaMetaTarget(e: Prisma.PrismaClientKnownRequestError): unknown {
  const meta = e.meta;
  if (meta && typeof meta === "object" && "target" in meta) {
    return (meta as { target?: unknown }).target;
  }
  return undefined;
}

function mapKeyConflict(e: unknown): { status: number; code: string; message: string; details?: unknown } | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      return {
        status: 409,
        code: "KEY_CONFLICT",
        message: "Field key must be unique per form.",
        details: { target: prismaMetaTarget(e) },
      };
    }
  }
  return null;
}

export async function PATCH(req: Request, ctx: unknown) {
  try {
    const tenant = await requireTenantContext(req);
    const { id: formId, fieldId } = await getParams<{ id: string; fieldId: string }>(ctx);

    if (!IdSchema.safeParse(formId).success) throw httpError(404, "NOT_FOUND", "Not found.");
    if (!IdSchema.safeParse(fieldId).success) throw httpError(404, "NOT_FOUND", "Not found.");

    const body = await validateBody(req, UpdateFieldSchema);

    const res = await prisma.formField.updateMany({
      where: { id: fieldId, formId, tenantId: tenant.id },
      data: {
        key: body.key,
        label: body.label,
        type: body.type,
        required: body.required,
        isActive: body.isActive,
        placeholder: body.placeholder === undefined ? undefined : body.placeholder,
        helpText: body.helpText === undefined ? undefined : body.helpText,
        config: toNullableJsonInput(body.config),
      },
    });

    if (res.count === 0) throw httpError(404, "NOT_FOUND", "Not found.");

    const updated = await prisma.formField.findFirst({
      where: { id: fieldId, formId, tenantId: tenant.id },
    });

    if (!updated) throw httpError(404, "NOT_FOUND", "Not found.");
    return jsonOk(req, updated);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    const conflict = mapKeyConflict(e);
    if (conflict) return jsonError(req, conflict.status, conflict.code, conflict.message, conflict.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}

export async function DELETE(req: Request, ctx: unknown) {
  try {
    const tenant = await requireTenantContext(req);
    const { id: formId, fieldId } = await getParams<{ id: string; fieldId: string }>(ctx);

    if (!IdSchema.safeParse(formId).success) throw httpError(404, "NOT_FOUND", "Not found.");
    if (!IdSchema.safeParse(fieldId).success) throw httpError(404, "NOT_FOUND", "Not found.");

    const res = await prisma.formField.deleteMany({
      where: { id: fieldId, formId, tenantId: tenant.id },
    });

    if (res.count === 0) throw httpError(404, "NOT_FOUND", "Not found.");
    return jsonOk(req, { ok: true });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
