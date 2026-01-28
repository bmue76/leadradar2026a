import { adminFetchJson } from "../../../_lib/adminFetch";
import type { BuilderForm, BuilderField, FormStatus, FieldType } from "./builder.types";
import { isRecord } from "./builder.types";

type FetchErr = { ok: false; code: string; message: string; traceId?: string; status?: number };
type FetchOk<T> = { ok: true; data: T; traceId?: string };
type FetchRes<T> = FetchOk<T> | FetchErr;

function toStringOrNull(v: unknown): string | null {
  if (typeof v === "string") return v;
  return null;
}

function toBool(v: unknown, def: boolean): boolean {
  if (typeof v === "boolean") return v;
  return def;
}

function toNum(v: unknown, def: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return def;
}

function normalizeField(row: unknown): BuilderField | null {
  if (!isRecord(row)) return null;

  const id = toStringOrNull(row.id);
  const key = toStringOrNull(row.key);
  const label = toStringOrNull(row.label);
  const type = toStringOrNull(row.type) as FieldType | null;

  if (!id || !key || !label || !type) return null;

  return {
    id,
    key,
    label,
    type,
    required: toBool(row.required, false),
    isActive: toBool(row.isActive, true),
    sortOrder: toNum(row.sortOrder, 0),
    placeholder: (row.placeholder === null ? null : toStringOrNull(row.placeholder)) ?? null,
    helpText: (row.helpText === null ? null : toStringOrNull(row.helpText)) ?? null,
    config: row.config ?? null,
  };
}

export async function loadForm(formId: string): Promise<FetchRes<BuilderForm>> {
  const res = await adminFetchJson<unknown>(`/api/admin/v1/forms/${formId}`, { method: "GET" });
  if (!res.ok) return res;

  const dto = res.data;
  if (!isRecord(dto)) {
    return { ok: false, code: "BAD_RESPONSE", message: "Unexpected response.", traceId: res.traceId, status: 500 };
  }

  const id = toStringOrNull(dto.id);
  const name = toStringOrNull(dto.name);
  const status = toStringOrNull(dto.status) as FormStatus | null;

  if (!id || !name || !status) {
    return { ok: false, code: "BAD_RESPONSE", message: "Unexpected response.", traceId: res.traceId, status: 500 };
  }

  const fieldsRaw = dto.fields;
  const fields: BuilderField[] = Array.isArray(fieldsRaw)
    ? fieldsRaw.map(normalizeField).filter((x): x is BuilderField => Boolean(x))
    : [];

  fields.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const out: BuilderForm = {
    id,
    name,
    description: dto.description === null ? null : (toStringOrNull(dto.description) ?? null),
    status,
    config: dto.config ?? null,
    fields,
  };

  return { ok: true, data: out, traceId: res.traceId };
}

export async function createField(
  formId: string,
  body: {
    key: string;
    label: string;
    type: FieldType;
    required?: boolean;
    isActive?: boolean;
    placeholder?: string | null;
    helpText?: string | null;
    config?: unknown | null;
  }
): Promise<FetchRes<BuilderField>> {
  const res = await adminFetchJson<unknown>(`/api/admin/v1/forms/${formId}/fields`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) return res;

  const f = normalizeField(res.data);
  if (!f) return { ok: false, code: "BAD_RESPONSE", message: "Unexpected response.", traceId: res.traceId, status: 500 };
  return { ok: true, data: f, traceId: res.traceId };
}

export async function patchField(
  formId: string,
  fieldId: string,
  body: Partial<{
    key: string;
    label: string;
    type: FieldType;
    required: boolean;
    isActive: boolean;
    placeholder: string | null;
    helpText: string | null;
    config: unknown | null;
  }>
): Promise<FetchRes<BuilderField>> {
  const res = await adminFetchJson<unknown>(`/api/admin/v1/forms/${formId}/fields/${fieldId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) return res;

  const f = normalizeField(res.data);
  if (!f) return { ok: false, code: "BAD_RESPONSE", message: "Unexpected response.", traceId: res.traceId, status: 500 };
  return { ok: true, data: f, traceId: res.traceId };
}

export async function deleteField(formId: string, fieldId: string): Promise<FetchRes<{ ok: true }>> {
  const res = await adminFetchJson<unknown>(`/api/admin/v1/forms/${formId}/fields/${fieldId}`, {
    method: "DELETE",
  });
  if (!res.ok) return res;
  return { ok: true, data: { ok: true }, traceId: res.traceId };
}

export async function reorderFields(formId: string, orderedIds: string[]): Promise<FetchRes<{ updated: number }>> {
  const res = await adminFetchJson<unknown>(`/api/admin/v1/forms/${formId}/fields/reorder`, {
    method: "POST",
    body: JSON.stringify({ orderedIds }),
  });
  if (!res.ok) return res;

  if (!isRecord(res.data)) return { ok: true, data: { updated: orderedIds.length }, traceId: res.traceId };
  const updated = typeof res.data.updated === "number" ? res.data.updated : orderedIds.length;
  return { ok: true, data: { updated }, traceId: res.traceId };
}

function mergeConfig(prev: unknown, patch: Record<string, unknown>): unknown {
  const base: Record<string, unknown> = isRecord(prev) ? { ...prev } : {};
  return { ...base, ...patch };
}

export async function patchFormBasics(
  formId: string,
  body: { name?: string; description?: string | null; configPatch?: Record<string, unknown> }
): Promise<FetchRes<BuilderForm>> {
  const payload: Record<string, unknown> = {};
  if (body.name !== undefined) payload.name = body.name;
  if (body.description !== undefined) payload.description = body.description;

  if (body.configPatch) {
    // we need the current config to merge — fetch minimal via loadForm
    const cur = await loadForm(formId);
    if (!cur.ok) return cur;
    payload.config = mergeConfig(cur.data.config, body.configPatch);
  }

  const res = await adminFetchJson<unknown>(`/api/admin/v1/forms/${formId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) return res;

  // endpoint returns full form incl fields -> reuse loader normalization
  const normalized = await loadForm(formId);
  return normalized.ok ? { ok: true, data: normalized.data, traceId: res.traceId } : normalized;
}

export async function patchFormStatus(formId: string, status: FormStatus): Promise<FetchRes<{ status: FormStatus }>> {
  const res = await adminFetchJson<unknown>(`/api/admin/v1/forms/${formId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return res;

  if (!isRecord(res.data)) return { ok: true, data: { status }, traceId: res.traceId };
  const s = (typeof res.data.status === "string" ? res.data.status : status) as FormStatus;
  return { ok: true, data: { status: s }, traceId: res.traceId };
}

/** TP 4.9 — Save current form as template */
function extractTemplateId(dto: unknown): string | null {
  if (!isRecord(dto)) return null;
  const id = toStringOrNull(dto.id);
  if (id) return id;

  const tid = toStringOrNull(dto.templateId);
  if (tid) return tid;

  const tpl = dto.template;
  if (isRecord(tpl)) {
    const tid2 = toStringOrNull(tpl.id);
    if (tid2) return tid2;
  }
  return null;
}

export async function saveTemplateFromForm(
  formId: string,
  body: { name: string; category?: string }
): Promise<FetchRes<{ templateId: string }>> {
  const payload: Record<string, unknown> = { formId, name: body.name };
  const cat = (body.category ?? "").trim();
  if (cat.length) payload.category = cat;

  const res = await adminFetchJson<unknown>(`/api/admin/v1/templates`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) return res;

  const templateId = extractTemplateId(res.data);
  if (!templateId) {
    return { ok: false, code: "BAD_RESPONSE", message: "Unexpected response.", traceId: res.traceId, status: 500 };
  }
  return { ok: true, data: { templateId }, traceId: res.traceId };
}
