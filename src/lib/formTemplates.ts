import { FieldType } from "@prisma/client";

export type FormTemplateFieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  sortOrder: number;
  placeholder?: string | null;
  helpText?: string | null;
  config?: Record<string, unknown> | null;
};

export type FormTemplateDef = {
  key: string;
  name: string;
  description?: string | null;
  fields: FormTemplateFieldDef[];
};

const STANDARD_TEMPLATE: FormTemplateDef = {
  key: "standard",
  name: "Messekontakt / Standard",
  description: "Standardformular für Messekontakte (MVP).",
  fields: [
    {
      key: "firstName",
      label: "Vorname",
      type: FieldType.TEXT,
      required: true,
      sortOrder: 10,
      placeholder: "Vorname",
    },
    {
      key: "lastName",
      label: "Nachname",
      type: FieldType.TEXT,
      required: true,
      sortOrder: 20,
      placeholder: "Nachname",
    },
    {
      key: "company",
      label: "Firma",
      type: FieldType.TEXT,
      required: false,
      sortOrder: 30,
      placeholder: "Firma",
    },
    {
      key: "email",
      label: "E-Mail",
      type: FieldType.EMAIL,
      required: false,
      sortOrder: 40,
      placeholder: "name@firma.ch",
    },
    {
      key: "phone",
      label: "Telefon",
      type: FieldType.PHONE,
      required: false,
      sortOrder: 50,
      placeholder: "+41 …",
    },
    {
      key: "notes",
      label: "Notizen",
      type: FieldType.TEXTAREA,
      required: false,
      sortOrder: 60,
      placeholder: "Kurz notieren, worum es ging…",
    },
    {
      key: "consent",
      label: "Einwilligung (optional)",
      type: FieldType.CHECKBOX,
      required: false,
      sortOrder: 70,
      helpText: "Optional – z.B. Newsletter/Follow-up Zustimmung.",
      config: { defaultValue: false },
    },
  ],
};

const TEMPLATES: Record<string, FormTemplateDef> = {
  standard: STANDARD_TEMPLATE,
};

export function getFormTemplate(templateKey: string): FormTemplateDef | null {
  const k = (templateKey || "").trim().toLowerCase();
  return TEMPLATES[k] ?? null;
}

export function listFormTemplates(): Array<Pick<FormTemplateDef, "key" | "name" | "description">> {
  return Object.values(TEMPLATES).map((t) => ({ key: t.key, name: t.name, description: t.description ?? null }));
}
