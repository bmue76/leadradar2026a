import { z } from "zod";
import { FieldType, Prisma, FormStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, httpError, validateBody } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const IdSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i);

const CreateFromPresetSchema = z
  .object({
    presetId: IdSchema,
    // Optional override name; if omitted we use preset.name
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    status: z.nativeEnum(FormStatus).optional(), // default DRAFT
  })
  .strict();

const FieldDraftSchema = z
  .object({
    key: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_]+$/),
    label: z.string().trim().min(1).max(200),
    type: z.string().trim().min(1).max(50),
    required: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    placeholder: z.string().trim().max(2000).nullable().optional(),
    helpText: z.string().trim().max(2000).nullable().optional(),
    config: z.unknown().nullable().optional(),
  })
  .strict();

const FIELD_TYPE_VALUES = new Set(Object.values(FieldType) as string[]);

function parseFieldType(v: unknown): FieldType {
  if (typeof v === "string") {
    const t = v.trim().toUpperCase();
    if (FIELD_TYPE_VALUES.has(t)) return t as FieldType;
  }
  return FieldType.TEXT;
}

function extractFieldsFromPresetConfig(cfg: unknown): Array<z.infer<typeof FieldDraftSchema>> {
  if (!cfg || typeof cfg !== "object") return [];

  const o = cfg as Record<string, unknown>;

  // Preferred (TP7 seed): config.fields = [...]
  const direct = o.fields;
  if (Array.isArray(direct)) {
    const out: Array<z.infer<typeof FieldDraftSchema>> = [];
    for (const item of direct) {
      const res = FieldDraftSchema.safeParse(item);
      if (res.success) out.push(res.data);
    }
    return out;
  }

  // Backward-compat: config.fieldsSnapshot = [...]
  const snap = o.fieldsSnapshot;
  if (Array.isArray(snap)) {
    const out: Array<z.infer<typeof FieldDraftSchema>> = [];
    for (const item of snap) {
      const res = FieldDraftSchema.safeParse(item);
      if (res.success) out.push(res.data);
    }
    return out;
  }

  return [];
}

function assertUniqueKeys(fields: Array<{ key: string }>) {
  const seen = new Set<string>();
  for (const f of fields) {
    const k = f.key;
    if (seen.has(k)) throw httpError(400, "DUPLICATE_FIELD_KEY", `Duplicate field key: ${k}`);
    seen.add(k);
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const body = await validateBody(req, CreateFromPresetSchema);

    // Read preset (tenant-owned OR public future)
    const preset = await prisma.formPreset.findFirst({
      where: {
        id: body.presetId,
        OR: [{ tenantId }, { tenantId: null, isPublic: true }],
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        description: true,
        category: true,
        isPublic: true,
        config: true,
      },
    });

    if (!preset) throw httpError(404, "NOT_FOUND", "Not found.");

    const rawCfg = preset.config as unknown;
    const rawFields = extractFieldsFromPresetConfig(rawCfg);

    if (!rawFields.length) {
      throw httpError(400, "PRESET_INVALID", "Preset has no fields (config.fields missing).");
    }

    // Normalize + validate + deterministic ordering
    const fields = rawFields
      .map((f, idx) => ({
        key: f.key,
        label: f.label,
        type: parseFieldType(f.type),
        required: Boolean(f.required),
        sortOrder: typeof f.sortOrder === "number" ? f.sortOrder : (idx + 1) * 10,
        placeholder: typeof f.placeholder === "string" ? f.placeholder : null,
        helpText: typeof f.helpText === "string" ? f.helpText : null,
        config: typeof f.config === "undefined" ? null : f.config,
      }))
      .sort((a, b) => (a.sortOrder - b.sortOrder) || a.key.localeCompare(b.key));

    assertUniqueKeys(fields);

    const formName = (body.name ?? preset.name).trim();
    const formDescription = (body.description ?? preset.description ?? "").trim();
    const status = body.status ?? FormStatus.DRAFT;

    const created = await prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          tenantId,
          name: formName,
          description: formDescription ? formDescription : null,
          status,
          // Keep full preset config snapshot on form for traceability (MVP).
          config: rawCfg as Prisma.InputJsonValue,
          assignedEventId: null,
        },
        select: { id: true, name: true, status: true, createdAt: true, updatedAt: true },
      });

      for (const f of fields) {
        await tx.formField.create({
          data: {
            tenantId,
            formId: form.id,
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            isActive: true,
            sortOrder: f.sortOrder,
            placeholder: f.placeholder,
            helpText: f.helpText,
            config: (f.config ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });
      }

      return form;
    });

    return jsonOk(req, created, { status: 201 });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
