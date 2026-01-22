import { type Lead } from "@prisma/client";
import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { validateBody, isHttpError, httpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const ApplyOcrBodySchema = z.object({
  ocrResultId: z.string().min(1),
  preferCorrected: z.boolean().optional().default(true),
});

type Contact = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  company?: string;
  title?: string;
  website?: string;
  street?: string;
  zip?: string;
  city?: string;
  country?: string;
};

type LeadContactRow = Pick<
  Lead,
  | "contactFirstName"
  | "contactLastName"
  | "contactEmail"
  | "contactPhone"
  | "contactMobile"
  | "contactCompany"
  | "contactTitle"
  | "contactWebsite"
  | "contactStreet"
  | "contactZip"
  | "contactCity"
  | "contactCountry"
>;

function normalizeContact(v: unknown): Contact | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const get = (k: keyof Contact) => (typeof o[k] === "string" && String(o[k]).trim().length > 0 ? String(o[k]).trim() : undefined);
  return {
    firstName: get("firstName"),
    lastName: get("lastName"),
    email: get("email"),
    phone: get("phone"),
    mobile: get("mobile"),
    company: get("company"),
    title: get("title"),
    website: get("website"),
    street: get("street"),
    zip: get("zip"),
    city: get("city"),
    country: get("country"),
  };
}

function contactEquals(a: LeadContactRow, b: LeadContactRow): boolean {
  const keys: (keyof LeadContactRow)[] = [
    "contactFirstName",
    "contactLastName",
    "contactEmail",
    "contactPhone",
    "contactMobile",
    "contactCompany",
    "contactTitle",
    "contactWebsite",
    "contactStreet",
    "contactZip",
    "contactCity",
    "contactCountry",
  ];
  return keys.every((k) => (a[k] ?? null) === (b[k] ?? null));
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminAuth(req);
    const tenantId = admin.tenantId;

    const { id: leadId } = await ctx.params;
    const body = await validateBody(req, ApplyOcrBodySchema, 64 * 1024);

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: {
        id: true,
        contactFirstName: true,
        contactLastName: true,
        contactEmail: true,
        contactPhone: true,
        contactMobile: true,
        contactCompany: true,
        contactTitle: true,
        contactWebsite: true,
        contactStreet: true,
        contactZip: true,
        contactCity: true,
        contactCountry: true,
      },
    });
    if (!lead) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const ocr = await prisma.leadOcrResult.findFirst({
      where: { id: body.ocrResultId, tenantId },
      select: {
        id: true,
        leadId: true,
        status: true,
        correctedContactJson: true,
        parsedContactJson: true,
      },
    });
    if (!ocr) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    if (ocr.leadId !== leadId) throw httpError(409, "OCR_LEAD_MISMATCH", "OCR result does not belong to this lead.");
    if (ocr.status !== "COMPLETED") throw httpError(409, "OCR_NOT_READY", "OCR result is not completed.");

    const corrected = normalizeContact(ocr.correctedContactJson);
    const parsed = normalizeContact(ocr.parsedContactJson);

    const chosen =
      body.preferCorrected && corrected && Object.values(corrected).some((v) => !!v) ? corrected : parsed;

    if (!chosen) {
      throw httpError(409, "OCR_EMPTY_CONTACT", "OCR result contains no usable contact fields.");
    }

    const next: LeadContactRow = {
      contactFirstName: chosen.firstName ?? null,
      contactLastName: chosen.lastName ?? null,
      contactEmail: chosen.email ?? null,
      contactPhone: chosen.phone ?? null,
      contactMobile: chosen.mobile ?? null,
      contactCompany: chosen.company ?? null,
      contactTitle: chosen.title ?? null,
      contactWebsite: chosen.website ?? null,
      contactStreet: chosen.street ?? null,
      contactZip: chosen.zip ?? null,
      contactCity: chosen.city ?? null,
      contactCountry: chosen.country ?? null,
    };

    const applied = !contactEquals(lead, next);
    const now = new Date();

    const updated = applied
      ? await prisma.lead.update({
          where: { id: leadId },
          data: {
            ...next,
            contactSource: "OCR_ADMIN",
            contactUpdatedAt: now,
            contactOcrResultId: ocr.id,
          },
          select: {
            id: true,
            contactFirstName: true,
            contactLastName: true,
            contactEmail: true,
            contactPhone: true,
            contactMobile: true,
            contactCompany: true,
            contactTitle: true,
            contactWebsite: true,
            contactStreet: true,
            contactZip: true,
            contactCity: true,
            contactCountry: true,
            contactSource: true,
            contactUpdatedAt: true,
            contactOcrResultId: true,
          },
        })
      : await prisma.lead.findFirstOrThrow({
          where: { id: leadId, tenantId },
          select: {
            id: true,
            contactFirstName: true,
            contactLastName: true,
            contactEmail: true,
            contactPhone: true,
            contactMobile: true,
            contactCompany: true,
            contactTitle: true,
            contactWebsite: true,
            contactStreet: true,
            contactZip: true,
            contactCity: true,
            contactCountry: true,
            contactSource: true,
            contactUpdatedAt: true,
            contactOcrResultId: true,
          },
        });

    return jsonOk(req, {
      applied,
      used: body.preferCorrected ? "CORRECTED_OR_PARSED" : "PARSED",
      lead: {
        id: updated.id,
        contact: {
          firstName: updated.contactFirstName,
          lastName: updated.contactLastName,
          email: updated.contactEmail,
          phone: updated.contactPhone,
          mobile: updated.contactMobile,
          company: updated.contactCompany,
          title: updated.contactTitle,
          website: updated.contactWebsite,
          street: updated.contactStreet,
          zip: updated.contactZip,
          city: updated.contactCity,
          country: updated.contactCountry,
        },
        contactSource: updated.contactSource,
        contactUpdatedAt: updated.contactUpdatedAt,
        contactOcrResultId: updated.contactOcrResultId,
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_SERVER_ERROR", "Unexpected server error.");
  }
}
