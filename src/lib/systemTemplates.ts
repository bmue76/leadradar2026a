export const SYSTEM_TEMPLATE_IDS = [
  // Existing (already visible)
  "cmljzik0p000050tsro8hnfnh", // example: if you moved one to system manually, you can list it here (optional)
  // Canonical ones
  "cmll1qlyt0000cotslj6z665w",
  // keep the two classic ones (replace with your real IDs if different)
  "cm_system_lead_qualifizierung",
  "cm_system_messekontakt_standard",
] as const;

/**
 * IMPORTANT:
 * - `SYSTEM_TEMPLATE_IDS` is used to detect “system-marked” IDs in the UI.
 * - The actual “System” state in DB is still: tenantId=NULL && isPublic=true.
 *
 * If you already have the real IDs for the two classic system templates,
 * replace the placeholders `cm_system_*` with the real ids.
 */

const SYSTEM_ID_SET = new Set<string>(SYSTEM_TEMPLATE_IDS as unknown as string[]);

export function isSystemTemplateId(id: string): boolean {
  return SYSTEM_ID_SET.has(String(id || "").trim());
}

type PresetFieldSnapshot = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  placeholder: string | null;
  helpText: string | null;
  isActive: boolean;
  config: Record<string, unknown>;
};

type CaptureStart = "FORM_FIRST" | "CONTACT_FIRST";

export type SystemTemplateSeed = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  imageUrl: string | null;
  config: {
    schemaVersion: 1;
    v: 1;
    source: "SYSTEM_SEED";
    captureStart: CaptureStart;
    formConfig: Record<string, unknown>;
    fields: PresetFieldSnapshot[];
  };
};

/**
 * Seeds:
 * - This is a pragmatic baseline so ensureSystemPresets can upsert missing system templates.
 * - You can refine field sets anytime; existing non-empty configs are NOT overwritten by default.
 */
export const SYSTEM_TEMPLATE_SEEDS: SystemTemplateSeed[] = [
  {
    id: "cm_system_lead_qualifizierung",
    name: "Lead Qualifizierung",
    category: "Sales",
    description: "Qualifizierung direkt am Stand: Interesse, Timing, Budget, Notizen.",
    imageUrl: null,
    config: {
      schemaVersion: 1,
      v: 1,
      source: "SYSTEM_SEED",
      captureStart: "FORM_FIRST",
      formConfig: { captureStart: "FORM_FIRST" },
      fields: [
        {
          key: "interestLevel",
          label: "Interesse",
          type: "SINGLE_SELECT",
          required: true,
          placeholder: null,
          helpText: "Wie warm ist der Lead?",
          isActive: true,
          config: { section: "FORM", options: ["Hoch", "Mittel", "Tief"] },
        },
        {
          key: "timing",
          label: "Projektzeitpunkt",
          type: "SINGLE_SELECT",
          required: true,
          placeholder: null,
          helpText: null,
          isActive: true,
          config: { section: "FORM", options: ["Sofort", "3–6 Monate", "Später / unklar"] },
        },
        {
          key: "budget",
          label: "Budgetrahmen",
          type: "SINGLE_SELECT",
          required: false,
          placeholder: null,
          helpText: null,
          isActive: true,
          config: { section: "FORM", options: ["< 5k", "5–20k", "> 20k", "Unklar"] },
        },
        {
          key: "notes",
          label: "Notizen",
          type: "TEXTAREA",
          required: false,
          placeholder: "Stichworte…",
          helpText: null,
          isActive: true,
          config: { section: "FORM" },
        },
        {
          key: "consent",
          label: "Einwilligung Kontaktaufnahme",
          type: "CHECKBOX",
          required: false,
          placeholder: null,
          helpText: "DSG/Opt-in gemäss Gespräch.",
          isActive: true,
          config: { section: "FORM", variant: "consent" },
        },

        // Contact block
        { key: "firstName", label: "Vorname", type: "TEXT", required: false, placeholder: null, helpText: null, isActive: true, config: { section: "CONTACT" } },
        { key: "lastName", label: "Nachname", type: "TEXT", required: false, placeholder: null, helpText: null, isActive: true, config: { section: "CONTACT" } },
        { key: "company", label: "Firma", type: "TEXT", required: false, placeholder: null, helpText: null, isActive: true, config: { section: "CONTACT" } },
        { key: "title", label: "Funktion", type: "TEXT", required: false, placeholder: null, helpText: null, isActive: true, config: { section: "CONTACT" } },
        { key: "email", label: "E-Mail", type: "TEXT", required: false, placeholder: null, helpText: null, isActive: true, config: { section: "CONTACT" } },
        { key: "phone", label: "Telefon", type: "TEXT", required: false, placeholder: null, helpText: null, isActive: true, config: { section: "CONTACT" } },
      ],
    },
  },
  {
    id: "cm_system_messekontakt_standard",
    name: "Messekontakt Standard",
    category: "Messe",
    description: "Standard-Leadformular für Messen mit Interessen + Follow-up.",
    imageUrl: null,
    config: {
      schemaVersion: 1,
      v: 1,
      source: "SYSTEM_SEED",
      captureStart: "FORM_FIRST",
      formConfig: { captureStart: "FORM_FIRST" },
      fields: [
        {
          key: "topic",
          label: "Thema / Anlass",
          type: "TEXT",
          required: false,
          placeholder: "Weshalb sprechen wir?",
          helpText: null,
          isActive: true,
          config: { section: "FORM" },
        },
        {
          key: "interestProducts",
          label: "Interesse an",
          type: "MULTI_SELECT",
          required: false,
          placeholder: null,
          helpText: null,
          isActive: true,
          config: { section: "FORM", options: ["Produkt A", "Produkt B", "Service", "Beratung"] },
        },
        {
          key: "followUp",
          label: "Follow-up",
          type: "SINGLE_SELECT",
          required: false,
          placeholder: null,
          helpText: null,
          isActive: true,
          config: { section: "FORM", options: ["Bitte anrufen", "Bitte mailen", "Termin vereinbaren", "Kein Follow-up"] },
        },
        {
          key: "notes",
          label: "Notizen",
          type: "TEXTAREA",
          required: false,
          placeholder: "Stichworte…",
          helpText: null,
          isActive: true,
          config: { section: "FORM" },
        },

        // Contact block
        { key: "firstName", label: "Vorname", type: "TEXT", required: false, placeholder: null, helpText: null, isActive: true, config: { section: "CONTACT" } },
        { key: "lastName", label: "Nachname", type: "TEXT", required: false, placeholder: null, helpText: null, isActive: true, config: { section: "CONTACT" } },
        { key: "company", label: "Firma", type: "TEXT", required: false, placeholder: null, helpText: null, isActive: true, config: { section: "CONTACT" } },
        { key: "email", label: "E-Mail", type: "TEXT", required: false, placeholder: null, helpText: null, isActive: true, config: { section: "CONTACT" } },
        { key: "phone", label: "Telefon", type: "TEXT", required: false, placeholder: null, helpText: null, isActive: true, config: { section: "CONTACT" } },
      ],
    },
  },

  // The ID you mentioned (you can refine name/category later)
  {
    id: "cmll1qlyt0000cotslj6z665w",
    name: "Systemvorlage (Neu)",
    category: "Messe",
    description: "Neue Systemvorlage (Seed). Passe Name/Felder später an.",
    imageUrl: null,
    config: {
      schemaVersion: 1,
      v: 1,
      source: "SYSTEM_SEED",
      captureStart: "FORM_FIRST",
      formConfig: { captureStart: "FORM_FIRST" },
      fields: [
        { key: "notes", label: "Notizen", type: "TEXTAREA", required: false, placeholder: "Stichworte…", helpText: null, isActive: true, config: { section: "FORM" } },

        // Contact block
        { key: "firstName", label: "Vorname", type: "TEXT", required: false, placeholder: null, helpText: null, isActive: true, config: { section: "CONTACT" } },
        { key: "lastName", label: "Nachname", type: "TEXT", required: false, placeholder: null, helpText: null, isActive: true, config: { section: "CONTACT" } },
        { key: "company", label: "Firma", type: "TEXT", required: false, placeholder: null, helpText: null, isActive: true, config: { section: "CONTACT" } },
        { key: "email", label: "E-Mail", type: "TEXT", required: false, placeholder: null, helpText: null, isActive: true, config: { section: "CONTACT" } },
      ],
    },
  },
];
