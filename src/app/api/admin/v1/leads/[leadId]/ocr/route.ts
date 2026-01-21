import { Prisma, type Lead, type LeadAttachment, type LeadOcrResult } from "@prisma/client";
import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { validateBody, isHttpError, httpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";

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

const CorrectOcrBodySchema = z
  .object({
    ocrResultId: z.string().min(1),
    correctedContact: ContactSchema,
  })
  .superRefine((b, ctx) => {
    if (!hasAnyContactField(b.correctedContact)) {
      ctx.addIssue({ code: "custom", message: "correctedContact must include at least one non-empty field." });
    }
  });

type LeadContactPick = Pick<
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

function toContactShapeFromLead(lead: LeadContactPick) {
  return {
    firstName: lead.contactFirstName ?? null,
    lastName: lead.contactLastName ?? null,
    email: lead.contactEmail ?? null,
    phone: lead.contactPhone ?? null,
    mobile: lead.contactMobile ?? null,
    company: lead.contactCompany ?? null,
    title: lead.contactTitle ?? null,
    website: lead.contactWebsite ?? null,
    street: lead.contactStreet ?? null,
    zip: lead.contactZip ?? null,
    city: lead.contactCity ?? null,
    country: lead.contactCountry ?? null,
  };
}

function toOcrApiShape(r: LeadOcrResult) {
  return {
    id: r.id,
    leadId: r.leadId,
    attachmentId: r.attachmentId,
    kind: r.kind,
    mode: r.mode,
    status: r.status,
    engine: r.engine,
    engineVersion: r.engineVersion,
    languageHint: r.languageHint,
    rawText: r.rawText,
    blocksJson: r.blocksJson ?? null,
    parsedContact: r.parsedContactJson ?? null,
    correctedContact: r.correctedContactJson ?? null,
    confidence: r.confidence ?? null,
    resultHash: r.resultHash ?? null,
    completedAt: r.completedAt ?? null,
    errorCode: r.errorCode ?? null,
    errorMessage: r.errorMessage ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    correctedAt: r.correctedAt ?? null,
    correctedByUserId: r.correctedByUserId ?? null,
  };
}

function toJsonInput(v: unknown | undefined | null): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (v === undefined || v === null) return Prisma.DbNull;
  return v as Prisma.InputJsonValue;
}

function getAdminUserId(admin: unknown): string | undefined {
  const a = admin as Record<string, unknown>;
  const v = a.userId ?? a.id;
  return typeof v === "string" ? v : undefined;
}

export async function GET(req: Request, ctx: { params: { leadId: string } }) {
  try {
    const admin = await requireAdminAuth(req);
    const tenantId = admin.tenantId;
    const leadId = ctx.params.leadId;

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: {
        id: true,
        formId: true,
        capturedAt: true,

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

        attachments: {
          where: { type: "BUSINESS_CARD_IMAGE" },
          select: {
            id: true,
            type: true,
            filename: true,
            mimeType: true,
            sizeBytes: true,
            storageKey: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!lead) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const attachmentIds = lead.attachments.map((a: LeadAttachment) => a.id);

    const ocrResults =
      attachmentIds.length === 0
        ? []
        : await prisma.leadOcrResult.findMany({
            where: { tenantId, leadId, attachmentId: { in: attachmentIds } },
            orderBy: [{ updatedAt: "desc" }],
            take: 50,
          });

    return jsonOk(req, {
      lead: {
        id: lead.id,
        formId: lead.formId,
        capturedAt: lead.capturedAt,
        contact: toContactShapeFromLead(lead),
        contactSource: lead.contactSource ?? null,
        contactUpdatedAt: lead.contactUpdatedAt ?? null,
        contactOcrResultId: lead.contactOcrResultId ?? null,
      },
      attachments: lead.attachments,
      ocrResults: ocrResults.map(toOcrApiShape),
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_SERVER_ERROR", "Unexpected server error.");
  }
}

export async function PATCH(req: Request, ctx: { params: { leadId: string } }) {
  try {
    const admin = await requireAdminAuth(req);
    const tenantId = admin.tenantId;
    const adminUserId = getAdminUserId(admin);

    const leadId = ctx.params.leadId;
    const body = await validateBody(req, CorrectOcrBodySchema, 256 * 1024);

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: { id: true },
    });
    if (!lead) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const ocr = await prisma.leadOcrResult.findFirst({
      where: { id: body.ocrResultId, tenantId },
      select: { id: true, leadId: true },
    });
    if (!ocr) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    if (ocr.leadId !== leadId) {
      throw httpError(409, "OCR_LEAD_MISMATCH", "OCR result does not belong to this lead.");
    }

    const now = new Date();

    const updated = await prisma.leadOcrResult.update({
      where: { id: body.ocrResultId },
      data: {
        correctedContactJson: toJsonInput(body.correctedContact ?? null),
        correctedAt: now,
        correctedByUserId: adminUserId ?? null,
      },
    });

    return jsonOk(req, { ocr: toOcrApiShape(updated) });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_SERVER_ERROR", "Unexpected server error.");
  }
}
