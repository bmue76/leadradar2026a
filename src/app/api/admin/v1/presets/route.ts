import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody, validateQuery } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

function firstString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return undefined;
}

function cleanText(v: unknown): string | undefined {
  const s = firstString(v);
  const t = (s ?? "").trim();
  return t ? t : undefined;
}

function cleanEnum(v: unknown): string | undefined {
  return cleanText(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const IdSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i);

const ListPresetsQuerySchema = z
  .object({
    q: z.preprocess((v) => cleanText(v), z.string().min(1).max(200).optional()),
    category: z.preprocess((v) => cleanText(v), z.string().min(1).max(200).optional()),

    // MVP: default tenant-only. Future: allow includePublic=true.
    scope: z.preprocess((v) => cleanEnum(v), z.enum(["TENANT", "ALL"]).default("TENANT")),

    take: z.preprocess(
      (v) => {
        const s = firstString(v);
        const n = Number(s);
        if (!Number.isFinite(n)) return undefined;
        return n;
      },
      z.number().int().min(1).max(100).default(50)
    ),
  })
  .strict();

const CreatePresetSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    category: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    imageUrl: z.string().trim().max(2000).url().optional(),

    // Snapshot payload (Builder config).
    config: z.unknown(),

    // Optional: allows server to attach fields snapshot from DB
    sourceFormId: IdSchema.optional(),
    formId: IdSchema.optional(), // accept legacy naming
  })
  .passthrough();

function normalizeCategory(v?: string): string {
  const t = (v ?? "").trim();
  return t ? t : "Standard";
}

/**
 * We validate "presence" + basic shape (key/label/type).
 * Keep tolerant (passthrough) because Builder snapshots may include extra keys.
 */
function tryParseFieldsArray(arr: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(arr)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const it of arr) {
    if (!isRecord(it)) continue;
    if (typeof it.key !== "string" || typeof it.label !== "string" || typeof it.type !== "string") continue;
    out.push(it);
  }
  return out;
}

function extractFieldsFromConfig(cfg: unknown): Array<Record<string, unknown>> {
  if (!cfg || typeof cfg !== "object") return [];
  const o = cfg as Record<string, unknown>;

  const direct = tryParseFieldsArray(o.fields);
  if (direct.length) return direct;

  const snap = tryParseFieldsArray(o.fieldsSnapshot);
  if (snap.length) return snap;

  // Deep scan (light): stop early on first hit
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): Array<Record<string, unknown>> => {
    if (!v || typeof v !== "object") return [];
    if (seen.has(v)) return [];
    seen.add(v);

    if (Array.isArray(v)) {
      const hit = tryParseFieldsArray(v);
      if (hit.length) return hit;
      if (depth <= 0) return [];
      for (const x of v) {
        const r = walk(x, depth - 1);
        if (r.length) return r;
      }
      return [];
    }

    if (depth <= 0) return [];
    const obj = v as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      const r = walk(obj[k], depth - 1);
      if (r.length) return r;
    }
    return [];
  };

  return walk(cfg, 5);
}

function ensureSchemaVersionV1(cfgObj: Record<string, unknown>) {
  const v = cfgObj.schemaVersion;
  if (typeof v === "number" && Number.isFinite(v) && Math.floor(v) === v && v >= 1) return;
  cfgObj.schemaVersion = 1;
}

export async function GET(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const query = await validateQuery(req, ListPresetsQuerySchema);

    const where: Prisma.FormPresetWhereInput =
      query.scope === "ALL"
        ? {
            OR: [{ tenantId }, { tenantId: null, isPublic: true }],
          }
        : { tenantId };

    if (query.q) where.name = { contains: query.q, mode: "insensitive" };
    if (query.category) where.category = { equals: query.category, mode: "insensitive" };

    const rows = await prisma.formPreset.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: query.take,
      select: {
        id: true,
        tenantId: true,
        name: true,
        category: true,
        description: true,
        imageUrl: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const items = rows.map((r) => ({
      id: r.id,
      scope: r.isPublic && !r.tenantId ? ("PUBLIC" as const) : ("TENANT" as const),
      name: r.name,
      category: (r.category ?? "").trim() ? r.category : null,
      description: r.description ?? null,
      imageUrl: r.imageUrl ?? null,
      isPublic: Boolean(r.isPublic),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return jsonOk(req, { items });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const body = await validateBody(req, CreatePresetSchema);

    const sourceFormId = (body.sourceFormId ?? body.formId ?? "").trim() || null;

    // Ensure config is an object (so we can normalize)
    const cfgObj: Record<string, unknown> = isRecord(body.config) ? { ...body.config } : {};
    ensureSchemaVersionV1(cfgObj);

    // If config has no fields, but we know the source form => snapshot from DB
    if (extractFieldsFromConfig(cfgObj).length === 0 && sourceFormId) {
      const form = await prisma.form.findFirst({ where: { id: sourceFormId, tenantId }, select: { id: true } });
      if (!form) throw httpError(404, "NOT_FOUND", "Quellformular nicht gefunden.");

      const rows = await prisma.formField.findMany({
        where: { tenantId, formId: sourceFormId },
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
        },
      });

      if (!rows.length) throw httpError(400, "SOURCE_FORM_HAS_NO_FIELDS", "Quellformular hat keine Felder.");

      cfgObj.fields = rows.map((r) => ({
        key: r.key,
        label: r.label,
        type: String(r.type),
        required: Boolean(r.required),
        sortOrder: r.sortOrder ?? undefined,
        placeholder: (r.placeholder ?? null) as string | null,
        helpText: (r.helpText ?? null) as string | null,
        config: (typeof r.config === "undefined" ? null : r.config) as unknown,
      }));

      // traceability (optional)
      cfgObj.sourceFormId = sourceFormId;
    }

    // FINAL GUARANTEE: no empty presets/templates
    if (extractFieldsFromConfig(cfgObj).length === 0) {
      throw httpError(400, "PRESET_INVALID", "Vorlage muss mindestens ein Feld enthalten.");
    }

    const created = await prisma.formPreset.create({
      data: {
        tenantId,
        name: body.name,
        category: normalizeCategory(body.category),
        description: body.description ?? null,
        imageUrl: body.imageUrl ?? null,
        isPublic: false,
        config: (cfgObj as Prisma.InputJsonValue),
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        category: true,
        description: true,
        imageUrl: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return jsonOk(req, created, { status: 201 });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
