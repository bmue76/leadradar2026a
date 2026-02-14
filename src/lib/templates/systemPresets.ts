import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type SystemPresetSeed = {
  id: string;
  name: string;
  category: string;
  description: string;
  config: Prisma.InputJsonValue;
};

function field(input: {
  key: string;
  label: string;
  section: "FORM" | "CONTACT";
  type?: string;
  required?: boolean;
  placeholder?: string | null;
  helpText?: string | null;
  config?: Record<string, unknown>;
}) {
  return {
    key: input.key,
    label: input.label,
    type: input.type ?? "TEXT",
    required: Boolean(input.required),
    placeholder: typeof input.placeholder === "undefined" ? null : input.placeholder,
    helpText: typeof input.helpText === "undefined" ? null : input.helpText,
    isActive: true,
    config: { section: input.section, ...(input.config ?? {}) },
  };
}

// Stable IDs = robust + no extra DB columns needed
const SYSTEM_PRESETS: SystemPresetSeed[] = [
  {
    id: "sys-messekontakt-standard-v1",
    name: "Messekontakt Standard",
    category: "Messe",
    description: "Kontaktblock + Notiz + Interesse (Start: Kontakt zuerst).",
    config: {
      v: 1,
      source: "SYSTEM",
      captureStart: "CONTACT_FIRST",
      formConfig: {},
      fields: [
        // CONTACT
        field({ key: "firstName", label: "Vorname", section: "CONTACT", type: "TEXT" }),
        field({ key: "lastName", label: "Nachname", section: "CONTACT", type: "TEXT" }),
        field({ key: "company", label: "Firma", section: "CONTACT", type: "TEXT" }),
        field({ key: "email", label: "E-Mail", section: "CONTACT", type: "TEXT" }),
        field({ key: "mobile", label: "Mobile", section: "CONTACT", type: "TEXT" }),

        // FORM
        field({
          key: "interest",
          label: "Interesse",
          section: "FORM",
          type: "SINGLE_SELECT",
          required: false,
          config: { options: ["hoch", "mittel", "tief"] },
        }),
        field({ key: "notes", label: "Notiz", section: "FORM", type: "TEXT", required: false, placeholder: "Kurz notieren…" }),
      ],
    } as unknown as Prisma.InputJsonValue,
  },
  {
    id: "sys-qualify-lead-v1",
    name: "Lead Qualifizierung",
    category: "Vertrieb",
    description: "Kurze Quali-Fragen + Kontaktblock (Start: Kontakt zuerst).",
    config: {
      v: 1,
      source: "SYSTEM",
      captureStart: "CONTACT_FIRST",
      formConfig: {},
      fields: [
        // CONTACT
        field({ key: "firstName", label: "Vorname", section: "CONTACT", type: "TEXT" }),
        field({ key: "lastName", label: "Nachname", section: "CONTACT", type: "TEXT" }),
        field({ key: "company", label: "Firma", section: "CONTACT", type: "TEXT" }),
        field({ key: "email", label: "E-Mail", section: "CONTACT", type: "TEXT" }),

        // FORM
        field({
          key: "topic",
          label: "Thema",
          section: "FORM",
          type: "SINGLE_SELECT",
          config: { options: ["Produkt", "Preis", "Demo", "Support", "Sonstiges"] },
        }),
        field({
          key: "priority",
          label: "Priorität",
          section: "FORM",
          type: "SINGLE_SELECT",
          config: { options: ["A (heiss)", "B", "C"] },
        }),
        field({ key: "notes", label: "Notiz", section: "FORM", type: "TEXT", placeholder: "Was ist wichtig?" }),
      ],
    } as unknown as Prisma.InputJsonValue,
  },
];

export async function ensureSystemPresets(): Promise<void> {
  const ids = SYSTEM_PRESETS.map((x) => x.id);

  const existing = await prisma.formPreset.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });

  const have = new Set(existing.map((x) => x.id));
  const missing = SYSTEM_PRESETS.filter((x) => !have.has(x.id));
  if (!missing.length) return;

  await prisma.$transaction(
    missing.map((s) =>
      prisma.formPreset.create({
        data: {
          id: s.id,
          tenantId: null,
          isPublic: true,
          name: s.name,
          category: s.category,
          description: s.description,
          imageUrl: null,
          config: s.config,
        },
        select: { id: true },
      })
    )
  );
}
