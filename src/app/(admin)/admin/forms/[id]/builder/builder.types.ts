import type { Prisma, FieldType as PrismaFieldType } from "@prisma/client";

/**
 * Builder Domain Types (UI)
 * - We keep the UI flexible: some legacy UI compares against pseudo types like "RATING".
 * - Persisted DB types remain PrismaFieldType; pseudo types are UI-only and can be represented via config.variant.
 */

export type FormStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

/**
 * Final App Screens:
 * - FORM   = individual/lead fields
 * - CONTACT = contact block (screen 2)
 */
export type FieldSection = "FORM" | "CONTACT";

/**
 * UI-only field type extensions (legacy compatibility).
 * DB still stores PrismaFieldType.
 */
export type FieldType = PrismaFieldType | "RATING" | "YESNO" | "CONSENT";

/**
 * Variants used by UI library (keep aligned with FieldLibrary.tsx).
 */
export type FieldVariant =
  | "date"
  | "datetime"
  | "rating"
  | "yesNo"
  | "consent"
  | "attachment"
  | "audio";

/**
 * JSON config stored per field (Prisma Json)
 * NOTE: section may temporarily appear as string from UI drafts.
 */
export type BuilderFieldConfig =
  | (Record<string, unknown> & {
      section?: FieldSection | string;
      variant?: FieldVariant;

      options?: string[];
      ratingMax?: number;

      attachment?: {
        accept?: string[];
        maxFiles?: number;
      };

      audio?: {
        maxDurationSec?: number;
        allowRecord?: boolean;
        allowPick?: boolean;
      };
    })
  | null
  | undefined;

export type BuilderField = {
  id: string;
  key: string;
  label: string;
  type: FieldType;

  required: boolean;
  isActive: boolean;
  sortOrder: number;

  placeholder?: string | null;
  helpText?: string | null;

  config?: BuilderFieldConfig;
};

export type BuilderForm = {
  id: string;
  name: string;
  description?: string | null;

  status: FormStatus;
  assignedEventId?: string | null;

  config?: Prisma.JsonValue | null;

  createdAt?: string;
  updatedAt?: string;
};

export type ApiOk<T> = { ok: true; data: T; traceId: string };
export type ApiErr = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  traceId: string;
};
export type ApiResp<T> = ApiOk<T> | ApiErr;

/**
 * Builder GET payload (INNER payload!)
 * BuilderShell uses ApiResp<BuilderGetPayload>, so this must NOT be wrapped.
 */
export type BuilderGetPayload = { form: BuilderForm; fields: BuilderField[] };

/**
 * Field Library tabs (your UI uses FORM / CONTACT)
 */
export type LibraryTab = "FORM" | "CONTACT";

/**
 * Quick packs for contact blocks
 */
export type QuickPackId = "CONTACT_MINI" | "CONTACT_FULL";

/**
 * Library items
 * IMPORTANT: Some UI code accesses properties without narrowing.
 */
export type LibraryItem =
  | {
      id: string;
      tab: LibraryTab;
      kind: "type";
      title: string;
      subtitle?: string;
      description?: string;

      type: FieldType;
      keyBase: string;
      defaultLabel: string;

      defaultConfig?: BuilderFieldConfig;
      defaultPlaceholder?: string;
      defaultHelpText?: string;
    }
  | {
      id: string;
      tab: "CONTACT";
      kind: "contact";
      title: string;
      subtitle?: string;
      description?: string;

      type: FieldType;
      key: string;
      defaultLabel: string;

      defaultConfig?: BuilderFieldConfig;
      defaultPlaceholder?: string;
      defaultHelpText?: string;
    }
  | {
      id: string;
      tab: "CONTACT";
      kind: "preset";
      title: string;
      subtitle?: string;
      description?: string;

      packId: QuickPackId;

      // optional fields for TS-compat with UI code paths
      type?: FieldType;
      key?: string;
      keyBase?: string;
      defaultLabel?: string;
      defaultConfig?: BuilderFieldConfig;
      defaultPlaceholder?: string;
      defaultHelpText?: string;

      items: Array<
        | {
            kind: "type";
            type: FieldType;
            keyBase: string;
            label: string;
            placeholder?: string;
            helpText?: string;
            config?: BuilderFieldConfig;
          }
        | {
            kind: "contact";
            type: FieldType;
            key: string;
            label: string;
            placeholder?: string;
            helpText?: string;
            config?: BuilderFieldConfig;
          }
      >;
    };

/**
 * Helpers used across UI
 */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function getOptionsFromConfig(config: unknown): string[] {
  if (!isRecord(config)) return [];
  const raw = (config.options ?? config.selectOptions ?? config.optionsText) as unknown;

  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/\r?\n/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function setOptionsInConfig(config: unknown, options: string[]): Record<string, unknown> {
  const base: Record<string, unknown> = isRecord(config) ? { ...config } : {};
  base.options = options.map((s) => String(s).trim()).filter(Boolean);
  delete base.optionsText;
  delete base.selectOptions;
  return base;
}

export function isSystemField(field: Pick<BuilderField, "key">): boolean {
  const k = String(field.key || "").toLowerCase();
  return k === "id" || k === "createdat" || k === "updatedat";
}
