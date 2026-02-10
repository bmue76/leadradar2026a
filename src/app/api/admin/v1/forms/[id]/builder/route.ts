import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const IdSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i);

function isPromiseLike<T>(v: unknown): v is Promise<T> {
  return typeof v === "object" && v !== null && "then" in v && typeof (v as { then?: unknown }).then === "function";
}

async function getParams<T extends Record<string, string>>(ctx: unknown): Promise<T> {
  const params = (ctx as { params?: unknown })?.params;
  if (isPromiseLike<T>(params)) return await params;
  return params as T;
}

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

function cleanKeyBase(base: string): string {
  const cleaned = String(base || "")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .trim();
  return cleaned || "field";
}

function uniqueKey(base: string, used: Set<string>): string {
  const raw = cleanKeyBase(base);
  const MAX = 64;

  const clamp = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

  let candidate = clamp(raw, MAX);
  if (!used.has(candidate)) return candidate;

  for (let i = 2; i < 9999; i++) {
    const suffix = `_${i}`;
    const prefixMax = Math.max(1, MAX - suffix.length);
    candidate = clamp(raw, prefixMax) + suffix;
    if (!used.has(candidate)) return candidate;
  }

  // should never happen
  return clamp(raw, MAX);
}

const PatchSchema = z
  .object({
    op: z.string().trim().min(1),
  })
  .passthrough();

export async function GET(req: Request, ctx: unknown) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const { id: formId } = await getParams<{ id: string }>(ctx);

    if (!IdSchema.safeParse(formId).success) throw httpError(404, "NOT_FOUND", "Not found.");

    const form = await prisma.form.findFirst({
      where: { id: formId, tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        description: true,
        assignedEventId: true,
        createdAt: true,
        updatedAt: true,
        config: true,
      },
    });

    if (!form) throw httpError(404, "NOT_FOUND", "Not found.");

    const fields = await prisma.formField.findMany({
      where: { tenantId, formId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        key: true,
        label: true,
        type: true,
        required: true,
        isActive: true,
        sortOrder: true,
        placeholder: true,
        helpText: true,
        config: true,
      },
    });

    return jsonOk(req, { form, fields });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}

export async function PATCH(req: Request, ctx: unknown) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const { id: formId } = await getParams<{ id: string }>(ctx);

    if (!IdSchema.safeParse(formId).success) throw httpError(404, "NOT_FOUND", "Not found.");

    const body = await validateBody(req, PatchSchema);

    // ---------- REORDER ----------
    if (body.op === "REORDER") {
      const OrderSchema = z.object({ op: z.literal("REORDER"), order: z.array(IdSchema).min(1) });
      const b = OrderSchema.parse(body);

      const existing = await prisma.formField.findMany({
        where: { tenantId, formId },
        select: { id: true, sortOrder: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });

      if (existing.length === 0) return jsonOk(req, { updated: 0 });

      const existingIds = new Set(existing.map((x) => x.id));
      const given = b.order;

      for (const id of given) {
        if (!existingIds.has(id)) {
          throw httpError(400, "BAD_REQUEST", "Reihenfolge enthält ungültige Feld-Ids.", { id });
        }
      }

      const givenSet = new Set(given);
      const missing = existing.map((x) => x.id).filter((id) => !givenSet.has(id));
      const finalOrder = [...given, ...missing];

      const uniq = new Set(finalOrder);
      if (uniq.size !== finalOrder.length) {
        throw httpError(400, "BAD_REQUEST", "Reihenfolge enthält doppelte Feld-Ids.");
      }

      const updated = await prisma.$transaction(async (tx) => {
        let i = 0;
        for (const id of finalOrder) {
          await tx.formField.update({
            where: { id, tenantId },
            data: { sortOrder: i },
          });
          i += 1;
        }
        return finalOrder.length;
      });

      return jsonOk(req, { updated });
    }

    // ---------- PATCH_FIELD ----------
    if (body.op === "PATCH_FIELD") {
      const FieldPatchSchema = z.object({
        op: z.literal("PATCH_FIELD"),
        fieldId: IdSchema,
        patch: z
          .object({
            key: z.string().trim().min(1).max(64).optional(),
            label: z.string().trim().min(1).max(200).optional(),
            required: z.boolean().optional(),
            isActive: z.boolean().optional(),
            placeholder: z.string().trim().max(300).nullable().optional(),
            helpText: z.string().trim().max(500).nullable().optional(),
            config: z.unknown().nullable().optional(),
          })
          .strict(),
      });

      const b = FieldPatchSchema.parse(body);

      const updated = await prisma.$transaction(async (tx) => {
        const f = await tx.formField.findFirst({
          where: { id: b.fieldId, tenantId, formId },
          select: { id: true },
        });
        if (!f) throw httpError(404, "NOT_FOUND", "Not found.");

        return tx.formField.update({
          where: { id: b.fieldId, tenantId },
          data: {
            key: b.patch.key,
            label: b.patch.label,
            required: b.patch.required,
            isActive: b.patch.isActive,
            placeholder: b.patch.placeholder === undefined ? undefined : b.patch.placeholder,
            helpText: b.patch.helpText === undefined ? undefined : b.patch.helpText,
            config: b.patch.config === undefined ? undefined : (b.patch.config as Prisma.InputJsonValue),
          },
          select: {
            id: true,
            key: true,
            label: true,
            type: true,
            required: true,
            isActive: true,
            sortOrder: true,
            placeholder: true,
            helpText: true,
            config: true,
          },
        });
      });

      return jsonOk(req, updated);
    }

    // ---------- DELETE_FIELD ----------
    if (body.op === "DELETE_FIELD") {
      const DeleteSchema = z.object({
        op: z.literal("DELETE_FIELD"),
        fieldId: IdSchema,
      });
      const b = DeleteSchema.parse(body);

      const deleted = await prisma.$transaction(async (tx) => {
        const f = await tx.formField.findFirst({
          where: { id: b.fieldId, tenantId, formId },
          select: { id: true, sortOrder: true },
        });
        if (!f) throw httpError(404, "NOT_FOUND", "Not found.");

        await tx.formField.delete({
          where: { id: b.fieldId, tenantId },
        });

        await tx.formField.updateMany({
          where: { tenantId, formId, sortOrder: { gt: f.sortOrder } },
          data: { sortOrder: { decrement: 1 } },
        });

        return 1;
      });

      return jsonOk(req, { deleted });
    }

    // ---------- DUPLICATE_FIELD ----------
    if (body.op === "DUPLICATE_FIELD") {
      const DupSchema = z.object({
        op: z.literal("DUPLICATE_FIELD"),
        fieldId: IdSchema,
      });
      const b = DupSchema.parse(body);

      const created = await prisma.$transaction(async (tx) => {
        const src = await tx.formField.findFirst({
          where: { id: b.fieldId, tenantId, formId },
          select: {
            key: true,
            label: true,
            type: true,
            required: true,
            isActive: true,
            sortOrder: true,
            placeholder: true,
            helpText: true,
            config: true,
          },
        });
        if (!src) throw httpError(404, "NOT_FOUND", "Not found.");

        const keys = await tx.formField.findMany({
          where: { tenantId, formId },
          select: { key: true },
        });
        const used = new Set(keys.map((x) => x.key));
        const nextKey = uniqueKey(src.key, used);

        const baseLabel = `${src.label} (Kopie)`;
        const nextLabel = baseLabel.length > 200 ? baseLabel.slice(0, 200) : baseLabel;

        const insertAt = src.sortOrder + 1;

        await tx.formField.updateMany({
          where: { tenantId, formId, sortOrder: { gte: insertAt } },
          data: { sortOrder: { increment: 1 } },
        });

        return tx.formField.create({
          data: {
            tenantId,
            formId,
            key: nextKey,
            label: nextLabel,
            type: src.type,
            required: src.required,
            isActive: src.isActive,
            sortOrder: insertAt,
            placeholder: src.placeholder,
            helpText: src.helpText,
            config: (src.config ?? null) as Prisma.InputJsonValue,
          },
          select: {
            id: true,
            key: true,
            label: true,
            type: true,
            required: true,
            isActive: true,
            sortOrder: true,
            placeholder: true,
            helpText: true,
            config: true,
          },
        });
      });

      return jsonOk(req, created);
    }

    // ---------- PATCH_FORM ----------
    if (body.op === "PATCH_FORM") {
      const FormPatchSchema = z.object({
        op: z.literal("PATCH_FORM"),
        patch: z
          .object({
            name: z.string().trim().min(1).max(200).optional(),
            status: z.string().trim().min(1).optional(),
            description: z.string().trim().max(500).nullable().optional(),
            config: z.unknown().nullable().optional(),
          })
          .strict(),
      });

      const b = FormPatchSchema.parse(body);

      const updated = await prisma.form.updateMany({
        where: { id: formId, tenantId },
        data: {
          name: b.patch.name,
          status: b.patch.status as any,
          description: b.patch.description === undefined ? undefined : b.patch.description,
          config: b.patch.config === undefined ? undefined : (b.patch.config as Prisma.InputJsonValue),
        },
      });

      if (updated.count !== 1) throw httpError(404, "NOT_FOUND", "Not found.");

      return jsonOk(req, { updated: 1 });
    }

    throw httpError(400, "BAD_REQUEST", "Unbekannte Operation.");
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    const conflict = mapKeyConflict(e);
    if (conflict) return jsonError(req, conflict.status, conflict.code, conflict.message, conflict.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
