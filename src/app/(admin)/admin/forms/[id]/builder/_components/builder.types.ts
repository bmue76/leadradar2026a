import type { FieldType, FormStatus } from "@prisma/client";

export type FormFieldDto = {
  id: string;
  formId: string;
  tenantId: string;

  key: string;
  label: string;
  type: FieldType;

  required: boolean;
  isActive: boolean;
  sortOrder: number;

  placeholder: string | null;
  helpText: string | null;

  config: unknown;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type FormDto = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  status: FormStatus;
  config: unknown;
  createdAt: string | Date;
  updatedAt: string | Date;
  fields: FormFieldDto[];
};

export type AdminFetchOk<T> = { ok: true; data: T; traceId: string };
export type AdminFetchErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
export type AdminFetchRes<T> = AdminFetchOk<T> | AdminFetchErr;

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isSystemField(f: FormFieldDto): boolean {
  // MVP rule: if label marks OCR -> treat as system field (non deletable)
  const label = String(f.label ?? "");
  return label.toLowerCase().includes("(ocr)");
}

export function getOptionsFromConfig(config: unknown): string[] {
  if (!isRecord(config)) return [];
  const raw = config.options;
  if (Array.isArray(raw)) return raw.map((x) => String(x)).map((s) => s.trim()).filter(Boolean);
  return [];
}

export function setOptionsInConfig(config: unknown, options: string[]): unknown {
  const base: Record<string, unknown> = isRecord(config) ? { ...config } : {};
  base.options = options;
  return base;
}
