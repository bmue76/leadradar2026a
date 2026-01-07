import type { FormField } from "../formDetail.types";

type UnknownRecord = Record<string, unknown>;
export function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseOptions(config: unknown): string[] {
  if (!isRecord(config)) return [];
  const opts = config.options;
  if (!Array.isArray(opts)) return [];
  return opts.map((x) => String(x)).map((s) => s.trim()).filter(Boolean);
}

export function parseCheckboxDefault(config: unknown): boolean {
  if (!isRecord(config)) return false;
  const dv = config.defaultValue;
  return typeof dv === "boolean" ? dv : Boolean(dv);
}

export const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "TEXT", label: "Text" },
  { value: "TEXTAREA", label: "Textarea" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
  { value: "SINGLE_SELECT", label: "Select (single)" },
  { value: "MULTI_SELECT", label: "Select (multi)" },
  { value: "CHECKBOX", label: "Checkbox" },
];

export function typeLabel(t: string): string {
  const u = (t || "").toUpperCase();
  const hit = TYPE_OPTIONS.find((x) => x.value === u);
  return hit ? hit.label : u || "—";
}

export function buildConfigForDraft(type: string, draft: { optionsText: string; checkboxDefault: boolean }) {
  const t = type.toUpperCase();

  if (t === "SINGLE_SELECT" || t === "MULTI_SELECT") {
    const options = draft.optionsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    return { options };
  }

  if (t === "CHECKBOX") {
    return { defaultValue: Boolean(draft.checkboxDefault) };
  }

  return null;
}

export function getFieldLabel(f: FormField) {
  return f.label || f.key || "—";
}
