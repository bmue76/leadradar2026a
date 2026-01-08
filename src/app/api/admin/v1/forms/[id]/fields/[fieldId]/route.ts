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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function coerceBooleanLoose(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "1") return true;
    if (s === "0") return false;
  }
  return undefined;
}

function normalizeOptionsFromConfig(config: unknown): string[] {
  if (!isRecord(config)) return [];

  const opts = config.options ?? config.selectOptions;
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
    delete out.selectOptions;
    out.options = normalizeOptionsFromConfig(config);
    return out;
  }

  if (type === FieldType.CHECKBOX) {
    const out: Record<string, unknown> = { ...config };

    const raw = out.defaultValue ?? out.defaultBoolean ?? out.checkboxDefault;
    const parsed = coerceBooleanLoose(raw);
    const def = parsed ?? false;

    delete out.defaultBoolean;
    delete out.checkboxDefault;

    out.defaultValue = def;
    return out;
  }

  return config;
}

function ensureSelectDefaults(config: unknown): Prisma.InputJsonValue {
  const base: Record<string, unknown> = isRecord(config) ? { ...config } : {};
  const opts = normalizeOptionsFromConfig(base);
  base.options = opts.length > 0 ? opts : ["Option 1"];
  delete base.optionsText;
  delete base.selectOptions;
  return base as Prisma.InputJsonValue;
}

function ensureCheckboxDefaults(config: unknown): Prisma.InputJsonValue {
  const base: Record<string, unknown> = isRecord(config) ? { ...config } : {};
  const raw = base.defaultValue ?? base.defaultBoolean ?? base.checkboxDefault;
  const parsed = coerceBooleanLoose(raw);
  base.defaultValue = parsed ?? false;
  delete base.defaultBoolean;
  delete base.checkboxDefault;
  return base as Prisma.InputJsonValue;
}

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
  .refine((d) => Object.keys(d).length > 0, { message: "No fields to update." })
  .superRefine((d, ctx) => {
    // If the client explicitly updates config while setting a select type,
    // enforce at least 1 option (handler also defaults when omitted).
    if (d.type === FieldType.SINGLE_SELECT || d.type === FieldType.MULTI_SELECT) {
      if (d.config !== undefined && d.config !== null) {
        const opts = normalizeOptionsFromConfig(d.config);
        if (opts.length < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["config"],
            message: "SELECT requires at least 1 option.",
          });
        }
      }
    }
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

export async function PATCH(req: Request, ctx: unknown) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const { id: formId, fieldId } = await getParams<{ id: string; fieldId: string }>(ctx);

    if (!IdSchema.safeParse(formId).success) throw httpError(404, "NOT_FOUND", "Not found.");
    if (!IdSchema.safeParse(fieldId).success) throw httpError(404, "NOT_FOUND", "Not found.");

    const body = await validateBody(req, UpdateFieldSchema);

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.formField.findFirst({
        where: { id: fieldId, formId, tenantId },
        select: { id: true, type: true, config: true },
      });
      if (!existing) throw httpError(404, "NOT_FOUND", "Not found.");

      const effectiveType = body.type ?? existing.type;

      // IMPORTANT:
      // - If config is explicitly updated -> normalize for effectiveType and ensure defaults for select/checkbox.
      // - If type changes but config is omitted -> preserve existing config but ensure defaults for select/checkbox.
      let configUpdate: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined = undefined;

      const typeChanged = body.type !== undefined && body.type !== existing.type;

      if (body.config === null) {
        // Disallow clearing config for SELECT types (would violate "min 1 option").
        if (effectiveType === FieldType.SINGLE_SELECT || effectiveType === FieldType.MULTI_SELECT) {
          throw httpError(400, "INVALID_BODY", "Invalid request body.", {
            config: ["SELECT requires at least 1 option (config cannot be cleared)."],
          });
        }
        configUpdate = Prisma.DbNull; // clear
      } else if (body.config !== undefined) {
        const normalized = normalizeFieldConfig(effectiveType, body.config);

        if (effectiveType === FieldType.SINGLE_SELECT || effectiveType === FieldType.MULTI_SELECT) {
          configUpdate = ensureSelectDefaults(normalized) as Prisma.InputJsonValue;
        } else if (effectiveType === FieldType.CHECKBOX) {
          configUpdate = ensureCheckboxDefaults(normalized) as Prisma.InputJsonValue;
        } else {
          configUpdate = normalized as Prisma.InputJsonValue;
        }
      } else if (typeChanged) {
        // No config provided, but type changed -> keep existing config (no data loss), and ensure sensible defaults
        if (effectiveType === FieldType.SINGLE_SELECT || effectiveType === FieldType.MULTI_SELECT) {
          configUpdate = ensureSelectDefaults(existing.config);
        } else if (effectiveType === FieldType.CHECKBOX) {
          configUpdate = ensureCheckboxDefaults(existing.config);
        }
      }

      const res = await tx.formField.updateMany({
        where: { id: fieldId, formId, tenantId },
        data: {
          key: body.key,
          label: body.label,
          type: body.type,
          required: body.required,
          isActive: body.isActive,
          placeholder: body.placeholder === undefined ? undefined : body.placeholder,
          helpText: body.helpText === undefined ? undefined : body.helpText,
          config: configUpdate,
        },
      });

      if (res.count === 0) throw httpError(404, "NOT_FOUND", "Not found.");

      const row = await tx.formField.findFirst({
        where: { id: fieldId, formId, tenantId },
      });
      if (!row) throw httpError(404, "NOT_FOUND", "Not found.");
      return row;
    });

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
    const { tenantId } = await requireAdminAuth(req);
    const { id: formId, fieldId } = await getParams<{ id: string; fieldId: string }>(ctx);

    if (!IdSchema.safeParse(formId).success) throw httpError(404, "NOT_FOUND", "Not found.");
    if (!IdSchema.safeParse(fieldId).success) throw httpError(404, "NOT_FOUND", "Not found.");

    const res = await prisma.formField.deleteMany({
      where: { id: fieldId, formId, tenantId },
    });

    if (res.count === 0) throw httpError(404, "NOT_FOUND", "Not found.");
    return jsonOk(req, { ok: true });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
