import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { requireAdminAuth } from "@/lib/auth";
import { isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * TP 2.7 Addendum:
 * - Expand "standard" template to match the provided Formular-Vorlage PDF:
 *   Kontaktinfos + Individualfelder (select options) + Bemerkung.
 *
 * Note: DATE picker + file/photo upload are tracked as backlog (new FieldTypes + storage/UI).
 */

const BodySchema = z.object({
  templateKey: z.enum(["standard"]).default("standard"),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(400).optional(),
});

type TemplateField = {
  key: string;
  label: string;
  type: "TEXT" | "TEXTAREA" | "SINGLE_SELECT" | "MULTI_SELECT" | "CHECKBOX" | "EMAIL" | "PHONE";
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  config?: Record<string, unknown>;
};

const STANDARD_TEMPLATE_V2 = {
  key: "standard" as const,
  version: 2,
  defaultName: "Messekontakt / Standard",
  defaultDescription:
    "Standard-Leadformular (Kontaktinfos + Qualifizierung). Erstellt als DRAFT und kann danach im Builder angepasst werden.",
  fields: [
    // Kontaktinformationen
    { key: "company", label: "Firma", type: "TEXT", placeholder: "Firma" },
    { key: "firstName", label: "Vorname", type: "TEXT", required: true, placeholder: "Vorname" },
    { key: "lastName", label: "Nachname", type: "TEXT", required: true, placeholder: "Nachname" },
    {
      key: "salutation",
      label: "Anrede",
      type: "SINGLE_SELECT",
      config: { options: ["Herr", "Frau", "Neutral"] },
    },
    { key: "jobTitle", label: "Funktion", type: "TEXT", placeholder: "z. B. Einkauf, CEO, Marketing" },
    { key: "street", label: "Adresse (Strasse/Nr.)", type: "TEXT", placeholder: "Strasse / Nr." },
    { key: "zip", label: "PLZ", type: "TEXT", placeholder: "PLZ" },
    { key: "city", label: "Ort", type: "TEXT", placeholder: "Ort" },
    { key: "country", label: "Land", type: "TEXT", placeholder: "Land" },

    // Zusätzlich sinnvoll (war bereits in deinem Standard-MVP)
    { key: "email", label: "E-Mail", type: "EMAIL", placeholder: "name@firma.ch" },
    { key: "phone", label: "Telefon", type: "PHONE", placeholder: "+41 ..." },

    // Individualfelder (gemäss PDF)
    {
      key: "leadType",
      label: "Leadtyp",
      type: "SINGLE_SELECT",
      config: {
        options: ["Lead", "Neukunde", "bestehender Kunde", "Partner", "Lieferant", "Mitbewerber", "Presse"],
      },
    },
    {
      key: "handledBy",
      label: "Von wem betreut",
      type: "SINGLE_SELECT",
      config: { options: ["Mitarbeiter/in A", "Mitarbeiter/in B", "Mitarbeiter/in C"] },
      helpText: "Platzhalter-Optionen (später: Users/Teams/Recipients anbinden).",
    },
    {
      key: "responsible",
      label: "Wer zuständig",
      type: "SINGLE_SELECT",
      config: { options: ["Mitarbeiter/in A", "Mitarbeiter/in B", "Mitarbeiter/in C"] },
      helpText: "Platzhalter-Optionen (später: Users/Teams/Recipients anbinden).",
    },
    {
      key: "leadQuality",
      label: "Lead Qualität",
      type: "SINGLE_SELECT",
      config: { options: ["A", "B", "C"] },
    },
    {
      key: "interest",
      label: "Interessiert sich für",
      type: "MULTI_SELECT",
      config: { options: ["Produkt A", "Produkt B", "Produkt C"] },
    },
    {
      key: "followUp",
      label: "FollowUp",
      type: "MULTI_SELECT",
      config: { options: ["Rückruf", "Termin vereinbaren", "Unterlagen senden"] },
    },
    {
      key: "urgency",
      label: "Dringlichkeit",
      type: "SINGLE_SELECT",
      config: { options: ["sehr dringend", "dringend", "nicht dringend"] },
    },
    { key: "notes", label: "Bemerkung", type: "TEXTAREA", placeholder: "Notizen / Kontext / nächste Schritte" },

    // Optional (war in deinem MVP als Standard enthalten; kann im Builder deaktiviert werden)
    {
      key: "consent",
      label: "Einwilligung (Consent)",
      type: "CHECKBOX",
      config: { defaultValue: false },
      helpText: "Optional – je nach Datenschutz-Flow.",
    },
  ] satisfies TemplateField[],
};

function getTemplate(key: "standard") {
  if (key === "standard") return STANDARD_TEMPLATE_V2;
  // (future templates)
  return STANDARD_TEMPLATE_V2;
}

export async function POST(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const body = await validateBody(req, BodySchema);

    const tpl = getTemplate(body.templateKey);
    const name = body.name ?? tpl.defaultName;
    const description = body.description ?? tpl.defaultDescription;

    const form = await prisma.$transaction(async (tx) => {
      const created = await tx.form.create({
        data: {
          tenantId,
          name,
          description,
          status: "DRAFT",
          config: {
            createdFromTemplate: tpl.key,
            templateVersion: tpl.version,
          },
        },
        select: { id: true },
      });

      await tx.formField.createMany({
        data: tpl.fields.map((f, idx) => ({
          tenantId,
          formId: created.id,
          key: f.key,
          label: f.label,
          type: f.type,
          required: Boolean(f.required),
          isActive: true,
          sortOrder: idx,
          placeholder: f.placeholder ?? null,
          helpText: f.helpText ?? null,
          config: (f.config ?? null) as any,
        })),
      });

      return created;
    });

    return jsonOk(req, { id: form.id });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
