export type FormStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export type FormListItem = {
  id: string;
  name: string;
  description?: string | null;
  status: FormStatus;
  createdAt: string;
  updatedAt: string;
  fieldsCount?: number;
};

export type CreateFormInput = {
  name: string;
  description?: string;
  status?: FormStatus;
  config?: unknown;
};

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiResponse<T> =
  | { ok: true; data: T; traceId: string }
  | { ok: false; error: ApiError; traceId: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFormStatus(value: unknown): value is FormStatus {
  return value === "DRAFT" || value === "ACTIVE" || value === "ARCHIVED";
}

function toStringOrNull(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return null;
}

function toStringOrUndefined(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  return undefined;
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function normalizeItem(raw: unknown): FormListItem | null {
  if (!isObject(raw)) return null;

  const id = toStringOrUndefined(raw.id);
  const name = toStringOrUndefined(raw.name);
  const statusRaw = raw.status;

  const createdAt = toStringOrUndefined(raw.createdAt);
  const updatedAt = toStringOrUndefined(raw.updatedAt);

  if (!id || !name || !createdAt || !updatedAt || !isFormStatus(statusRaw)) return null;

  const description = toStringOrNull(raw.description);
  const fieldsCount = toNumberOrUndefined(raw.fieldsCount);

  return {
    id,
    name,
    description,
    status: statusRaw,
    createdAt,
    updatedAt,
    fieldsCount,
  };
}

export function normalizeFormsListPayload(data: unknown): FormListItem[] {
  if (!isObject(data)) return [];

  // expected: { forms: [...] }
  const forms = data.forms;
  if (!Array.isArray(forms)) return [];

  const items: FormListItem[] = [];
  for (const f of forms) {
    const norm = normalizeItem(f);
    if (norm) items.push(norm);
  }

  // stable sort: newest updatedAt first (best-effort)
  items.sort((a, b) => {
    const da = Date.parse(a.updatedAt);
    const db = Date.parse(b.updatedAt);
    if (Number.isNaN(da) || Number.isNaN(db)) return 0;
    return db - da;
  });

  return items;
}

export function formatFormStatus(status: FormStatus): string {
  if (status === "DRAFT") return "Draft";
  if (status === "ACTIVE") return "Active";
  return "Archived";
}

export function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const fmt = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return fmt.format(d);
}
