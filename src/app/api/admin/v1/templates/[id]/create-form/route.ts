import { z } from "zod";
import { FieldType, Prisma, FormStatus } from "@prisma/client";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const IdSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i);

function cleanText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getStringProp(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

async function readJsonBodyOrEmpty(req: NextRequest): Promise<Record<string, unknown>> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!ct.includes("application/json")) return {};

  try {
    const text = await req.text();
    if (!text.trim()) return {};
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// UI darf leeren Body / zusätzliche Keys schicken
const CreateSchema = z
  .object({
    name: z.preprocess((v) => cleanText(v), z.string().min(1).max(200).optional()),
    description: z.preprocess((v) => cleanText(v), z.string().max(2000).optional()),
    status: z.nativeEnum(FormStatus).optional(),
  })
  .passthrough();

/* --------------------------- field extraction --------------------------- */

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

type FieldDraft = z.infer<typeof FieldDraftSchema>;

const FIELD_TYPE_VALUES = new Set(Object.values(FieldType) as string[]);

function parseFieldType(v: unknown): FieldType {
  if (typeof v === "string") {
    const t = v.trim().toUpperCase();
    if (FIELD_TYPE_VALUES.has(t)) return t as FieldType;
  }
  return FieldType.TEXT;
}

function tryParseFieldsArray(arr: unknown): FieldDraft[] {
  if (!Array.isArray(arr)) return [];
  const out: FieldDraft[] = [];
  for (const item of arr) {
    const res = FieldDraftSchema.safeParse(item);
    if (res.success) out.push(res.data);
  }
  return out;
}

function findFieldsDeep(cfg: unknown, maxDepth = 5): FieldDraft[] {
  const seen = new Set<unknown>();

  const walk = (v: unknown, depth: number): FieldDraft[] | null => {
    if (!v || typeof v !== "object") return null;
    if (seen.has(v)) return null;
    seen.add(v);

    // Array: zuerst direkt als fields[] interpretieren, dann in Elemente absteigen
    if (Array.isArray(v)) {
      const parsed = tryParseFieldsArray(v);
      if (parsed.length) return parsed;
      if (depth <= 0) return null;
      for (const item of v) {
        const found = walk(item, depth - 1);
        if (found?.length) return found;
      }
      return null;
    }

    if (depth <= 0) return null;

    const o = v as Record<string, unknown>;

    // Quick wins (typische Keys)
    const directKeys = ["fields", "fieldsSnapshot", "formFields", "schemaFields"];
    for (const k of directKeys) {
      if (k in o) {
        const parsed = tryParseFieldsArray(o[k]);
        if (parsed.length) return parsed;
      }
    }

    // generic descent
    for (const k of Object.keys(o)) {
      const found = walk(o[k], depth - 1);
      if (found?.length) return found;
    }

    return null;
  };

  return walk(cfg, maxDepth) ?? [];
}

function extractFieldsFromPresetConfig(cfg: unknown): FieldDraft[] {
  if (!isRecord(cfg)) return [];

  // Preferred
  const direct = tryParseFieldsArray(cfg.fields);
  if (direct.length) return direct;

  // Backward compat
  const snap = tryParseFieldsArray(cfg.fieldsSnapshot);
  if (snap.length) return snap;

  // Deep search (robust)
  return findFieldsDeep(cfg, 5);
}

function getSourceFormIdFromConfig(cfg: unknown): string | null {
  if (!isRecord(cfg)) return null;
  const v = getStringProp(cfg, "sourceFormId") ?? getStringProp(cfg, "formId");
  return v ?? null;
}

async function loadFieldsFromForm(tenantId: string, formId: string): Promise<FieldDraft[]> {
  // ensure ownership
  const form = await prisma.form.findFirst({ where: { id: formId, tenantId }, select: { id: true } });
  if (!form) return [];

  const rows = await prisma.formField.findMany({
    where: { tenantId, formId },
    orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    select: {
      key: true,
      label: true,
      type: true,
      required: true,
      sortOrder: true,
      placeholder: true,
      helpText: true,
      config: true,
      isActive: true,
    },
  });

  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    type: String(r.type),
    required: Boolean(r.required),
    sortOrder: r.sortOrder ?? undefined,
    placeholder: (r.placeholder ?? null) as string | null,
    helpText: (r.helpText ?? null) as string | null,
    config: typeof r.config === "undefined" ? null : (r.config as unknown),
    isActive: Boolean(r.isActive),
  }));
}

function assertUniqueKeys(fields: Array<{ key: string }>) {
  const seen = new Set<string>();
  for (const f of fields) {
    if (seen.has(f.key)) throw httpError(400, "DUPLICATE_FIELD_KEY", `Duplicate field key: ${f.key}`);
    seen.add(f.key);
  }
}

/* --------------------------------- POST --------------------------------- */

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireAdminAuth(req);

    const { id } = await ctx.params;
    const templateId = IdSchema.parse(id);

    const rawBody = await readJsonBodyOrEmpty(req);
    const parsed = CreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw httpError(400, "INVALID_BODY", "Invalid request body.", { issues: parsed.error.issues });
    }
    const body = parsed.data;

    const preset = await prisma.formPreset.findFirst({
      where: {
        id: templateId,
        OR: [{ tenantId }, { tenantId: null, isPublic: true }],
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        description: true,
        config: true,
      },
    });

    if (!preset) throw httpError(404, "NOT_FOUND", "Not found.");

    const rawCfg = preset.config as unknown;

    // 1) try extracting fields from config (direct + deep)
    let rawFields = extractFieldsFromPresetConfig(rawCfg);

    // 2) fallback: if config knows sourceFormId/formId, load fields from DB
    if (!rawFields.length) {
      const sourceFormId = getSourceFormIdFromConfig(rawCfg);
      if (sourceFormId) {
        rawFields = await loadFieldsFromForm(tenantId, sourceFormId);
      }
    }

    if (!rawFields.length) {
      throw httpError(400, "TEMPLATE_INVALID", "Template has no fields (config.fields missing).");
    }

    const fields = rawFields
      .map((f, idx) => ({
        key: f.key,
        label: f.label,
        type: parseFieldType(f.type),
        required: Boolean(f.required),
        isActive: typeof (f as unknown as { isActive?: unknown }).isActive === "boolean" ? Boolean((f as unknown as { isActive?: boolean }).isActive) : true,
        sortOrder: typeof f.sortOrder === "number" ? f.sortOrder : (idx + 1) * 10,
        placeholder: typeof f.placeholder === "string" ? f.placeholder : null,
        helpText: typeof f.helpText === "string" ? f.helpText : null,
        config: typeof f.config === "undefined" ? null : f.config,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));

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
          assignedEventId: null,
          config: rawCfg as Prisma.InputJsonValue,
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
            isActive: f.isActive,
            sortOrder: f.sortOrder,
            placeholder: f.placeholder,
            helpText: f.helpText,
            config: (f.config ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });
      }

      return form;
    });

    return jsonOk(req, { item: created }, { status: 201 });
  } catch (e) {
    console.error("templates/[id]/create-form failed", e);

    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
