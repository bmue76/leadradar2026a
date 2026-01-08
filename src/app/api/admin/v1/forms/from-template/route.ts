import { z } from "zod";
import { Prisma, FormStatus, FieldType } from "@prisma/client";

import { jsonError, jsonOk } from "@/lib/api";
import { requireAdminAuth } from "@/lib/auth";
import { isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * TP 2.7 Addendum:
 * - "standard" template aligned with Mustervorlage:
 *   Kontaktinfos: ONLY yellow-marked OCR fields
 *   + Individualfelder (Selects + Notes)
 *
 * Backlog (not implemented here):
 * - DATE picker
 * - file/photo upload
 */

const BodySchema = z.object({
  templateKey: z.enum(["standard"]).default("standard"),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(400).optional(),
});

type TemplateField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  config?: Prisma.InputJsonValue;
};

const STANDARD_TEMPLATE_V3 = {
  key: "standard" as const,
  version: 3,
  defaultName: "Messekontakt / Standard",
  defaultDescription:
    "Standard-Leadformular (Kontakt-OCR + Qualifizierung). Erstellt als DRAFT und kann danach im Builder angepasst werden.",
  fields: [
    // Kontaktinformationen (ONLY yellow-marked OCR fields)
    { key: "company", label: "Firma (OCR)", type: "TEXT", placeholder: "Firma" },
    { key: "firstName", label: "Vorname (OCR)", type: "TEXT", required: true, placeholder: "Vorname" },
    { key: "lastName", label: "Nachname (OCR)", type: "TEXT", required: true, placeholder: "Nachname" },
    { key: "jobTitle", label: "Funktion (OCR)", type: "TEXT", placeholder: "z. B. Einkauf, CEO, Marketing" },
    { key: "street", label: "Adresse (Strasse/Nr.) (OCR)", type: "TEXT", placeholder: "Strasse / Nr." },
    { key: "zip", label: "PLZ (OCR)", type: "TEXT", placeholder: "PLZ" },
    { key: "city", label: "Ort (OCR)", type: "TEXT", placeholder: "Ort" },

    // Individualfelder (gemäss Vorlage)
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
  ] satisfies TemplateField[],
};

function getTemplate(key: "standard") {
  if (key === "standard") return STANDARD_TEMPLATE_V3;
  return STANDARD_TEMPLATE_V3;
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
          status: FormStatus.DRAFT,
          config: {
            createdFromTemplate: tpl.key,
            templateVersion: tpl.version,
          } as Prisma.InputJsonValue,
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
          config: f.config ?? null,
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
