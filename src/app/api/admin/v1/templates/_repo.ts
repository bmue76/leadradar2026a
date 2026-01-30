import { FieldType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type TemplateSource = "SYSTEM" | "TENANT";

export type TemplateListItem = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  source: TemplateSource;
  fieldCount: number;
  updatedAt: string; // ISO
};

export type TemplateField = {
  key: string;
  label: string;
  type: string;
  required: boolean;
};

export type TemplateDetail = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  source: TemplateSource;
  fieldCount: number;
  updatedAt: string; // ISO
  fields: TemplateField[];
  raw?: unknown;
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isJsonValue(v: unknown): v is Json {
  if (v === null) return true;
  const t = typeof v;
  if (t === "boolean" || t === "number" || t === "string") return true;
  if (Array.isArray(v)) return v.every(isJsonValue);
  if (t === "object") {
    const r = v as Record<string, unknown>;
    return Object.values(r).every(isJsonValue);
  }
  return false;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getObj(v: unknown, key: string): Record<string, unknown> | null {
  if (!isObject(v)) return null;
  const x = v[key];
  return isObject(x) ? x : null;
}

function getArr(v: unknown, key: string): unknown[] | null {
  if (!isObject(v)) return null;
  const x = v[key];
  return Array.isArray(x) ? x : null;
}

function getStr(v: unknown, key: string): string | null {
  if (!isObject(v)) return null;
  const x = v[key];
  return typeof x === "string" ? x : null;
}

function getBool(v: unknown, key: string): boolean | null {
  if (!isObject(v)) return null;
  const x = v[key];
  return typeof x === "boolean" ? x : null;
}

function getNum(v: unknown, key: string): number | null {
  if (!isObject(v)) return null;
  const x = v[key];
  return typeof x === "number" ? x : null;
}

const FIELD_TYPE_VALUES = Object.values(FieldType) as string[];

function parseFieldType(v: unknown): FieldType {
  if (typeof v === "string" && FIELD_TYPE_VALUES.includes(v)) return v as FieldType;
  return "TEXT" as FieldType;
}

function extractFieldsFromPayload(payload: unknown): TemplateField[] {
  const list =
    (Array.isArray(payload) ? payload : null) ??
    getArr(payload, "fields") ??
    getArr(getObj(payload, "form"), "fields") ??
    getArr(getObj(payload, "schema"), "fields");

  if (!list) return [];

  return list.map((raw, idx) => {
    const key = getStr(raw, "key") ?? getStr(raw, "id") ?? getStr(raw, "name") ?? `field_${idx}`;
    const label = getStr(raw, "label") ?? getStr(raw, "title") ?? getStr(raw, "name") ?? key;
    const type = getStr(raw, "type") ?? getStr(raw, "fieldType") ?? "TEXT";
    const required = getBool(raw, "required") ?? getBool(raw, "isRequired") ?? false;

    return { key, label, type, required };
  });
}

function extractConfigFromPayload(payload: unknown): Prisma.InputJsonValue | undefined {
  if (!isObject(payload)) return undefined;
  const cfg = payload.config;
  if (cfg === undefined) return undefined;
  if (!isJsonValue(cfg)) return undefined;
  return cfg as Prisma.InputJsonValue;
}

function toIso(d: Date): string {
  return d.toISOString();
}

export async function listTemplatesForTenant(args: {
  tenantId: string;
  q?: string;
  category?: string | "ALL";
  source?: "ALL" | "SYSTEM" | "TENANT";
  sort?: "updatedAt" | "name";
  dir?: "asc" | "desc";
}): Promise<TemplateListItem[]> {
  // Schema: FormTemplate ist tenant-owned only (tenantId required).
  // Contract unterstützt SYSTEM, aber im aktuellen Schema gibt es keine SYSTEM-Templates.
  if (args.source === "SYSTEM") return [];

  const q = (args.q ?? "").trim();
  const category = args.category ?? "ALL";
  const sort = args.sort ?? "updatedAt";
  const dir = args.dir ?? "desc";

  const where: Prisma.FormTemplateWhereInput = {
    tenantId: args.tenantId,
    ...(q
      ? {
          name: { contains: q, mode: "insensitive" },
        }
      : {}),
    ...(category !== "ALL" ? { category } : {}),
  };

  const orderBy: Prisma.FormTemplateOrderByWithRelationInput = sort === "name" ? { name: dir } : { updatedAt: dir };

  const rows = await prisma.formTemplate.findMany({
    where,
    orderBy,
    take: 200,
  });

  return rows.map((t) => {
    const fields = extractFieldsFromPayload(t.payloadJson);
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      description: null,
      source: "TENANT",
      fieldCount: fields.length,
      updatedAt: toIso(t.updatedAt),
    };
  });
}

export async function getTemplateDetailForTenant(args: { tenantId: string; id: string }): Promise<TemplateDetail | null> {
  const t = await prisma.formTemplate.findFirst({
    where: { id: args.id, tenantId: args.tenantId },
  });
  if (!t) return null;

  const fields = extractFieldsFromPayload(t.payloadJson);

  return {
    id: t.id,
    name: t.name,
    category: t.category,
    description: null,
    source: "TENANT",
    fieldCount: fields.length,
    updatedAt: toIso(t.updatedAt),
    fields,
    raw: t.payloadJson,
  };
}

function extractFieldObjects(payload: unknown): Record<string, unknown>[] {
  const list =
    (Array.isArray(payload) ? payload : null) ??
    getArr(payload, "fields") ??
    getArr(getObj(payload, "form"), "fields") ??
    getArr(getObj(payload, "schema"), "fields");

  if (!list) return [];
  return list.filter(isObject);
}

export async function createFormFromTemplate(args: {
  tenantId: string;
  templateId: string;
  name: string;
}): Promise<{ formId: string } | null> {
  const tpl = await prisma.formTemplate.findFirst({
    where: { id: args.templateId, tenantId: args.tenantId },
  });
  if (!tpl) return null;

  const config = extractConfigFromPayload(tpl.payloadJson);

  const form = await prisma.form.create({
    data: {
      tenantId: args.tenantId,
      name: args.name,
      status: "DRAFT",
      assignedEventId: null,
      description: null,
      ...(config !== undefined ? { config } : {}),
    },
    select: { id: true },
  });

  const rawFields = extractFieldObjects(tpl.payloadJson);

  const createFields: Prisma.FormFieldCreateManyInput[] = rawFields.map((f, idx) => {
    const key = getStr(f, "key") ?? getStr(f, "id") ?? getStr(f, "name") ?? `field_${idx}`;
    const label = getStr(f, "label") ?? getStr(f, "title") ?? getStr(f, "name") ?? key;

    const type = parseFieldType(getStr(f, "type") ?? getStr(f, "fieldType"));
    const required = getBool(f, "required") ?? getBool(f, "isRequired") ?? false;

    const isActive = getBool(f, "isActive") ?? true;
    const sortOrder = getNum(f, "sortOrder") ?? idx;

    const placeholder = getStr(f, "placeholder");
    const helpText = getStr(f, "helpText");

    const cfg = isJsonValue(f.config) ? (f.config as Prisma.InputJsonValue) : undefined;

    return {
      tenantId: args.tenantId,
      formId: form.id,
      key,
      label,
      type,
      required,
      isActive,
      sortOrder,
      placeholder: placeholder ?? null,
      helpText: helpText ?? null,
      ...(cfg !== undefined ? { config: cfg } : {}),
    };
  });

  if (createFields.length) {
    await prisma.formField.createMany({
      data: createFields,
      skipDuplicates: true,
    });
  }

  return { formId: form.id };
}
