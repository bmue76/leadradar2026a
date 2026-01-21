import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { validateBody, isHttpError, httpError } from "@/lib/http";

export const runtime = "nodejs";

const ContactSchema = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  mobile: z.string().trim().min(1).optional(),
  company: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  website: z.string().trim().min(1).optional(),
  street: z.string().trim().min(1).optional(),
  zip: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  country: z.string().trim().min(1).optional(),
});

function hasAnyContactField(c: z.infer<typeof ContactSchema>): boolean {
  return Object.values(c).some((v) => typeof v === "string" && v.trim().length > 0);
}

const ApplyContactBodySchema = z
  .object({
    source: z.enum(["MANUAL", "OCR_MOBILE"]),
    contact: ContactSchema,
    ocrResultId: z.string().min(1).optional(),
  })
  .superRefine((b, ctx) => {
    if (!hasAnyContactField(b.contact)) {
      ctx.addIssue({ code: "custom", message: "contact must include at least one non-empty field." });
    }
  });

async function updateMobileTelemetry(auth: { apiKeyId: string; deviceId: string }) {
  const now = new Date();
  await prisma.mobileApiKey.update({ where: { id: auth.apiKeyId }, data: { lastUsedAt: now } });
  await prisma.mobileDevice.update({ where: { id: auth.deviceId }, data: { lastSeenAt: now } });
}

export async function PATCH(req: Request, ctx: { params: { leadId: string } }) {
  try {
    const auth = await requireMobileAuth(req);
    enforceRateLimit(`mobile:${auth.apiKeyId}:contact_patch`, { limit: 60, windowMs: 60_000 });

    await updateMobileTelemetry(auth);

    const leadId = ctx.params.leadId;
    const body = await validateBody(req, ApplyContactBodySchema, 256 * 1024);

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!lead) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    if (body.ocrResultId) {
      const ocr = await prisma.leadOcrResult.findFirst({
        where: { id: body.ocrResultId, tenantId: auth.tenantId },
        select: { id: true, leadId: true, status: true },
      });
      if (!ocr) return jsonError(req, 404, "NOT_FOUND", "Not found.");
      if (ocr.leadId !== leadId) {
        throw httpError(409, "OCR_LEAD_MISMATCH", "OCR result does not belong to this lead.");
      }
      if (ocr.status !== "COMPLETED") {
        throw httpError(409, "OCR_NOT_READY", "OCR result is not completed.");
      }
    }

    const now = new Date();

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: {
        contactFirstName: body.contact.firstName ?? null,
        contactLastName: body.contact.lastName ?? null,
        contactEmail: body.contact.email ?? null,
        contactPhone: body.contact.phone ?? null,
        contactMobile: body.contact.mobile ?? null,
        contactCompany: body.contact.company ?? null,
        contactTitle: body.contact.title ?? null,
        contactWebsite: body.contact.website ?? null,
        contactStreet: body.contact.street ?? null,
        contactZip: body.contact.zip ?? null,
        contactCity: body.contact.city ?? null,
        contactCountry: body.contact.country ?? null,

        contactSource: body.source,
        contactUpdatedAt: now,

        contactOcrResultId: body.ocrResultId ?? null,
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
    });

    const contact = {
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
    };

    return jsonOk(req, {
      leadId: updated.id,
      source: updated.contactSource,
      updatedAt: updated.contactUpdatedAt,
      ocrResultId: updated.contactOcrResultId,
      contact,
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
