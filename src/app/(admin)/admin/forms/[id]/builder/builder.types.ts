export type FieldType =
  | "TEXT"
  | "TEXTAREA"
  | "EMAIL"
  | "PHONE"
  | "CHECKBOX"
  | "SINGLE_SELECT"
  | "MULTI_SELECT";

export type FormStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export type BuilderField = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  isActive: boolean;
  sortOrder: number;
  placeholder: string | null;
  helpText: string | null;
  config: unknown | null;
};

export type BuilderForm = {
  id: string;
  name: string;
  description: string | null;
  status: FormStatus;
  config: unknown | null;
  fields: BuilderField[];
};

export type LibraryTab = "fields" | "contacts";

export type LibraryItem =
  | {
      id: string;
      tab: LibraryTab;
      title: string;
      subtitle?: string;
      kind: "type";
      type: FieldType;
      defaultLabel: string;
      keyBase: string;
      defaultConfig?: unknown;
      defaultPlaceholder?: string;
      defaultHelpText?: string;
    }
  | {
      id: string;
      tab: LibraryTab;
      title: string;
      subtitle?: string;
      kind: "preset";
      // mapped to existing FieldTypes (no schema change)
      type: FieldType;
      defaultLabel: string;
      keyBase: string;
      defaultConfig: unknown;
      defaultPlaceholder?: string;
      defaultHelpText?: string;
    }
  | {
      id: string;
      tab: "contacts";
      title: string;
      subtitle?: string;
      kind: "contact";
      type: FieldType;
      key: string;
      defaultLabel: string;
      defaultPlaceholder?: string;
      defaultHelpText?: string;
    };

export const CONTACT_KEYS = [
  "firstName",
  "lastName",
  "company",
  "email",
  "phone",
  "jobTitle",
  "street",
  "zip",
  "city",
  "country",
  "website",
] as const;

export type ContactKey = (typeof CONTACT_KEYS)[number];

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isSystemField(f: BuilderField): boolean {
  // MVP: OCR/system fields are the ones created with labels containing "(OCR)"
  return (f.label || "").includes("(OCR)");
}

export function getOptionsFromConfig(cfg: unknown): string[] {
  if (!isRecord(cfg)) return [];
  const raw = cfg.options;
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x)).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function setOptionsInConfig(cfg: unknown, options: string[]): unknown {
  const base: Record<string, unknown> = isRecord(cfg) ? { ...cfg } : {};
  base.options = options;
  return base;
}
