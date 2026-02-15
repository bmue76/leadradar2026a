import { z } from "zod";
import { FieldType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";
import { ensureSystemPresets } from "@/lib/templates/systemPresets";

export const runtime = "nodejs";

const CreateFormSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type FieldSnap = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string | null;
  helpText?: string | null;
  isActive?: boolean;
  config?: Record<string, unknown>;
};

function safeFieldType(input: string): FieldType {
  const allowed = new Set<string>(Object.values(FieldType) as unknown as string[]);
  const fallback = (Object.values(FieldType)[0] as unknown as FieldType) ?? ("TEXT" as unknown as FieldType);
  return allowed.has(input) ? (input as unknown as FieldType) : fallback;
}

function uniqueKey(base: string, used: Set<string>): string {
  const clean = base.replace(/[^a-zA-Z0-9_]/g, "_") || "field";
  if (!used.has(clean)) return clean;
  let i = 2;
  while (used.has(`${clean}_${i}`)) i++;
  return `${clean}_${i}`;
}

function extractFieldsFromConfig(cfg: unknown): FieldSnap[] {
  if (!isRecord(cfg)) return [];

  const direct = cfg.fields;
  if (Array.isArray(direct)) {
    const out: FieldSnap[] = [];
    for (const it of direct) {
      if (!isRecord(it)) continue;
      const key = typeof it.key === "string" ? it.key : "";
      const label = typeof it.label === "string" ? it.label : "";
      const type = typeof it.type === "string" ? it.type : "";
      if (!key.trim() || !label.trim() || !type.trim()) continue;

      out.push({
        key: key.trim(),
        label: label.trim(),
        type: type.trim(),
        required: Boolean(it.required),
        placeholder: (typeof it.placeholder === "string" ? it.placeholder : null) as string | null,
        helpText: (typeof it.helpText === "string" ? it.helpText : null) as string | null,
        isActive: typeof it.isActive === "boolean" ? it.isActive : true,
        config: isRecord(it.config) ? (it.config as Record<string, unknown>) : {},
      });
    }
    return out;
  }

  const snap = cfg.fieldsSnapshot;
  if (Array.isArray(snap)) {
    const out: FieldSnap[] = [];
    for (const it of snap) {
      if (!isRecord(it)) continue;
      const key = typeof it.key === "string" ? it.key : "";
      const label = typeof it.label === "string" ? it.label : "";
      const type = typeof it.type === "string" ? it.type : "";
      if (!key.trim() || !label.trim() || !type.trim()) continue;

      out.push({
        key: key.trim(),
        label: label.trim(),
        type: type.trim(),
        required: Boolean(it.required),
        placeholder: (typeof it.placeholder === "string" ? it.placeholder : null) as string | null,
        helpText: (typeof it.helpText === "string" ? it.helpText : null) as string | null,
        isActive: typeof it.isActive === "boolean" ? it.isActive : true,
        config: isRecord(it.config) ? (it.config as Record<string, unknown>) : {},
      });
    }
    return out;
  }

  // Deep scan (light): try to find an array that looks like fields
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): FieldSnap[] => {
    if (!v || typeof v !== "object") return [];
    if (seen.has(v)) return [];
    seen.add(v);

    if (Array.isArray(v)) {
      const asFields = extractFieldsFromConfig({ fields: v } as unknown);
      if (asFields.length) return asFields;
      if (depth <= 0) return [];
      for (const x of v) {
        const hit = walk(x, depth - 1);
        if (hit.length) return hit;
      }
      return [];
    }

    if (depth <= 0) return [];

    const obj = v as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      const hit = walk(obj[k], depth - 1);
      if (hit.length) return hit;
    }
    return [];
  };

  return walk(cfg, 5);
}

function extractFormConfig(cfg: unknown): Record<string, unknown> {
  if (!isRecord(cfg)) return {};
  const fc = cfg.formConfig;
  return isRecord(fc) ? { ...(fc as Record<string, unknown>) } : {};
}

function extractCaptureStart(cfg: unknown): "FORM_FIRST" | "CONTACT_FIRST" | null {
  if (!isRecord(cfg)) return null;
  const v = cfg.captureStart;
  if (v === "FORM_FIRST" || v === "CONTACT_FIRST") return v;
  return null;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const { id } = await ctx.params;

    await ensureSystemPresets();

    const body = await validateBody(req, CreateFormSchema);

    // Allowed: tenant-owned OR system-public
    const preset = await prisma.formPreset.findFirst({
      where: {
        id,
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

    if (!preset) throw httpError(404, "NOT_FOUND", "Not found.");

    const rawCfg = preset.config as unknown;

    const rawFields = extractFieldsFromConfig(rawCfg);
    if (!rawFields.length) {
      throw httpError(400, "TEMPLATE_INVALID", "Template has no fields (config.fields missing).");
    }

    const captureStart = extractCaptureStart(rawCfg);
    const formConfig = extractFormConfig(rawCfg);

    // Merge form config + add trace (non-breaking)
    const nextConfig: Record<string, unknown> = { ...formConfig };
    if (captureStart) nextConfig.captureStart = captureStart;

    nextConfig.createdFromTemplateId = preset.id;
    nextConfig.createdFromTemplateName = preset.name;
    nextConfig.createdFromTemplateAt = new Date().toISOString();
    nextConfig.createdFromTemplateSource = !preset.tenantId && preset.isPublic ? "SYSTEM" : "TENANT";

    const formName = (body.name ?? "").trim() || preset.name;

    const created = await prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          tenantId,
          name: formName,
          description: (preset.description ?? "").trim() ? preset.description : null,
          status: "DRAFT",
          config: nextConfig as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      const used = new Set<string>();
      const fieldsData = rawFields.map((f, idx) => {
        const key = uniqueKey(String(f.key ?? "field"), used);
        used.add(key);

        const cfg = isRecord(f.config) ? (f.config as Record<string, unknown>) : {};
        const section = cfg.section === "CONTACT" || cfg.section === "FORM" ? cfg.section : "FORM";

        return {
          tenantId,
          formId: form.id,
          key,
          label: String(f.label ?? "").trim() || key,
          type: safeFieldType(String(f.type ?? "")),
          required: Boolean(f.required),
          isActive: typeof f.isActive === "boolean" ? f.isActive : true,
          sortOrder: idx,
          placeholder: typeof f.placeholder === "string" ? f.placeholder : null,
          helpText: typeof f.helpText === "string" ? f.helpText : null,
          config: { ...cfg, section } as Prisma.InputJsonValue,
        };
      });

      await tx.formField.createMany({ data: fieldsData });

      return form;
    });

    return jsonOk(req, { formId: created.id }, { status: 201 });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
