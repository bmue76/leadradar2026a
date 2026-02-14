import { z } from "zod";
import { FieldType, Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const IdSchema = z.string().trim().min(1).max(64);

const BodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type FieldDraft = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  isActive: boolean;
  sortOrder: number;
  placeholder: string | null;
  helpText: string | null;
  config: Record<string, unknown> | null;
};

const FieldDraftLooseSchema = z
  .object({
    key: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(200),
    type: z.string().trim().min(1).max(80),
    required: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    placeholder: z.string().nullable().optional(),
    helpText: z.string().nullable().optional(),
    config: z.unknown().optional(),
  })
  .passthrough();

function normalizeFieldType(t: string): FieldType {
  const v = String(t || "").trim().toUpperCase();
  const allowed = new Set<string>(Object.values(FieldType));
  if (allowed.has(v)) return v as FieldType;
  return "TEXT" as FieldType;
}

function tryGetFieldsArray(cfg: unknown): unknown[] {
  if (!isRecord(cfg)) return [];

  const direct = cfg.fields;
  if (Array.isArray(direct)) return direct;

  const snap = cfg.fieldsSnapshot;
  if (Array.isArray(snap)) return snap;

  // light deep-scan (max depth 4)
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): unknown[] => {
    if (!v || typeof v !== "object") return [];
    if (seen.has(v)) return [];
    seen.add(v);

    if (Array.isArray(v)) {
      if (
        v.length &&
        isRecord(v[0]) &&
        ("key" in (v[0] as Record<string, unknown>) || "label" in (v[0] as Record<string, unknown>))
      )
        return v;
      if (depth <= 0) return [];
      for (const it of v) {
        const r = walk(it, depth - 1);
        if (r.length) return r;
      }
      return [];
    }

    if (depth <= 0) return [];
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      if (k === "fields" && Array.isArray(o[k])) return o[k] as unknown[];
      if (k === "fieldsSnapshot" && Array.isArray(o[k])) return o[k] as unknown[];
      const r = walk(o[k], depth - 1);
      if (r.length) return r;
    }
    return [];
  };

  const nested = walk(cfg, 4);
  return Array.isArray(nested) ? nested : [];
}

function extractFieldsFromPresetConfig(cfg: unknown): FieldDraft[] {
  const raw = tryGetFieldsArray(cfg);
  if (!raw.length) return [];

  const out: FieldDraft[] = [];
  let i = 0;

  for (const it of raw) {
    const parsed = FieldDraftLooseSchema.safeParse(it);
    if (!parsed.success) continue;

    const d = parsed.data;

    const key = d.key.trim();
    const label = d.label.trim();
    if (!key || !label) continue;

    out.push({
      key,
      label,
      type: normalizeFieldType(d.type),
      required: Boolean(d.required),
      isActive: d.isActive === false ? false : true,
      sortOrder: Number.isFinite(d.sortOrder as number) ? (d.sortOrder as number) : i,
      placeholder: typeof d.placeholder === "string" ? d.placeholder : d.placeholder === null ? null : null,
      helpText: typeof d.helpText === "string" ? d.helpText : d.helpText === null ? null : null,
      config: isRecord(d.config) ? (d.config as Record<string, unknown>) : null,
    });

    i += 1;
  }

  return out;
}

function uniqueKey(base: string, used: Set<string>): string {
  const clean = base.replace(/[^a-zA-Z0-9_]/g, "_") || "field";
  if (!used.has(clean)) return clean;
  let n = 2;
  while (used.has(`${clean}_${n}`)) n += 1;
  return `${clean}_${n}`;
}

function pickCaptureStart(cfg: unknown): "FORM_FIRST" | "CONTACT_FIRST" {
  if (!isRecord(cfg)) return "FORM_FIRST";
  const v = cfg.captureStart;
  return v === "CONTACT_FIRST" ? "CONTACT_FIRST" : "FORM_FIRST";
}

function pickFormConfig(cfg: unknown): Record<string, unknown> {
  if (!isRecord(cfg)) return {};
  const fc = cfg.formConfig;
  return isRecord(fc) ? { ...(fc as Record<string, unknown>) } : {};
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const { tenantId } = await requireAdminAuth(req);

    const { id } = await ctx.params;
    const templateId = IdSchema.parse(id);

    const body = await validateBody(req, BodySchema);

    // allow tenant templates OR system templates (tenantId=null,isPublic=true)
    const preset = await prisma.formPreset.findFirst({
      where: {
        id: templateId,
        OR: [{ tenantId }, { tenantId: null, isPublic: true }],
      },
      select: {
        id: true,
        tenantId: true,
        isPublic: true,
        name: true,
        description: true,
        config: true,
      },
    });

    if (!preset) {
      throw httpError(404, "NOT_FOUND", "Vorlage nicht gefunden.");
    }

    const cfg = preset.config as unknown;

    const fields = extractFieldsFromPresetConfig(cfg);
    if (!fields.length) {
      throw httpError(400, "TEMPLATE_INVALID", "Vorlage enthält keine Felder.");
    }

    const baseName = (body.name ?? "").trim() || preset.name;
    const formName = baseName.trim() || "Neues Formular";

    const baseConfig = pickFormConfig(cfg);
    const captureStart = pickCaptureStart(cfg);
    const nextConfig: Record<string, unknown> = { ...baseConfig, captureStart };

    const created = await prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          tenantId,
          name: formName,
          description: preset.description ?? null,
          status: "DRAFT",
          config: nextConfig as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      const usedKeys = new Set<string>();
      const sorted = fields.slice().sort((a, b) => a.sortOrder - b.sortOrder);

      let sortIdx = 0;
      for (const f of sorted) {
        const key = uniqueKey(f.key, usedKeys);
        usedKeys.add(key);

        await tx.formField.create({
          data: {
            tenantId,
            formId: form.id,
            key,
            label: f.label,
            type: f.type,
            required: f.required,
            isActive: f.isActive,
            sortOrder: sortIdx,
            placeholder: f.placeholder,
            helpText: f.helpText,
            config: f.config ? (f.config as Prisma.InputJsonValue) : undefined,
          },
        });

        sortIdx += 1;
      }

      return form;
    });

    return jsonOk(req, { id: created.id, formId: created.id }, { status: 201 });
  } catch (e) {
    console.error("templates/[id]/create-form failed", e);
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
