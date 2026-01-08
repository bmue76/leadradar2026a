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

const NullableTrimmedString = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().max(max).nullable().optional()
  );

const NullableBoolean = () =>
  z.preprocess((v) => (v === null ? undefined : v), z.boolean().optional());

const CoercedNullableInt = () =>
  z.preprocess((v) => {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return undefined;
      const n = Number(s);
      return Number.isFinite(n) ? n : v;
    }
    return v;
  }, z.number().int().min(0).optional());

const CreateFieldSchema = z.object({
  key: FieldKeySchema,
  label: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().min(1).max(200)
  ),
  type: z.nativeEnum(FieldType),

  // tolerate null coming from UI drafts
  required: NullableBoolean(),
  isActive: NullableBoolean(),
  sortOrder: CoercedNullableInt(),

  placeholder: NullableTrimmedString(300),
  helpText: NullableTrimmedString(500),

  // tolerate null / unknown shapes
  config: z.unknown().nullable().optional(),
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeOptionsFromConfig(config: unknown): string[] {
  if (!isRecord(config)) return [];

  const opts = config.options;
  if (Array.isArray(opts)) {
    return opts
      .map((x) => String(x))
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const ot = config.optionsText;
  if (typeof ot === "string") {
    return ot
      .split(/\r?\n/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeFieldConfig(type: FieldType, config: unknown): unknown {
  if (!isRecord(config)) return config;

  if (type === FieldType.SINGLE_SELECT || type === FieldType.MULTI_SELECT) {
    const out: Record<string, unknown> = { ...config };
    delete out.optionsText;
    out.options = normalizeOptionsFromConfig(config);
    return out;
  }

  if (type === FieldType.CHECKBOX) {
    const out: Record<string, unknown> = { ...config };

    const raw = out.defaultValue ?? out.defaultBoolean ?? out.checkboxDefault;
    const def = typeof raw === "boolean" ? raw : Boolean(raw);

    delete out.defaultBoolean;
    delete out.checkboxDefault;

    out.defaultValue = def;
    return out;
  }

  return config;
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

      const rawConfig = body.config === null ? undefined : body.config;
      const normalizedConfig =
        rawConfig === undefined ? undefined : (normalizeFieldConfig(body.type, rawConfig) as Prisma.InputJsonValue);

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

          placeholder: body.placeholder === undefined ? undefined : body.placeholder,
          helpText: body.helpText === undefined ? undefined : body.helpText,

          config: (normalizedConfig ?? undefined) as Prisma.InputJsonValue | undefined,
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
