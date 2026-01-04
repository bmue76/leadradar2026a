import { z } from "zod";
import { Prisma, FieldType } from "@prisma/client";

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

const FieldKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "key must match /^[a-zA-Z][a-zA-Z0-9_]*$/");

const CreateFieldSchema = z.object({
  key: FieldKeySchema,
  label: z.string().trim().min(1).max(200),
  type: z.nativeEnum(FieldType),
  required: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  placeholder: z.string().trim().max(300).optional(),
  helpText: z.string().trim().max(500).optional(),
  config: z.unknown().optional(),
});

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

export async function POST(req: Request, ctx: unknown) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const { id: formId } = await getParams<{ id: string }>(ctx);

    if (!IdSchema.safeParse(formId).success) throw httpError(404, "NOT_FOUND", "Not found.");

    const body = await validateBody(req, CreateFieldSchema);

    const created = await prisma.$transaction(async (tx) => {
      const form = await tx.form.findFirst({
        where: { id: formId, tenantId },
        select: { id: true },
      });
      if (!form) throw httpError(404, "NOT_FOUND", "Not found.");

      let sortOrder = body.sortOrder;
      if (sortOrder === undefined) {
        const agg = await tx.formField.aggregate({
          where: { tenantId, formId },
          _max: { sortOrder: true },
        });
        sortOrder = (agg._max.sortOrder ?? -1) + 1;
      }

      return tx.formField.create({
        data: {
          tenantId,
          formId,
          key: body.key,
          label: body.label,
          type: body.type,
          required: body.required ?? false,
          isActive: body.isActive ?? true,
          sortOrder,
          placeholder: body.placeholder,
          helpText: body.helpText,
          config: (body.config ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    });

    return jsonOk(req, created);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    const conflict = mapKeyConflict(e);
    if (conflict) return jsonError(req, conflict.status, conflict.code, conflict.message, conflict.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
