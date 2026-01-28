import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { jsonError, jsonOk as _jsonOk } from "@/lib/api";
import { isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant";

export const runtime = "nodejs";

type AdminCtx = { tenantId: string; userId: string | null };

function jsonOkCompat(req: Request, data: unknown, status = 200): Response {
  const fn = _jsonOk as unknown as (...args: unknown[]) => Response;
  // Support both signatures:
  // - jsonOk(req, data)
  // - jsonOk(req, status, data)
  if (typeof fn === "function" && fn.length >= 3) return fn(req, status, data);
  return fn(req, data);
}

async function resolveAdminCtx(req: Request): Promise<AdminCtx> {
  try {
    const auth = (await requireAdminAuth(req)) as { tenantId: string; userId?: string | null };
    return { tenantId: auth.tenantId, userId: auth.userId ?? null };
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      const t = await requireTenantContext(req);
      return { tenantId: t.id, userId: null };
    }
    throw e;
  }
}

function toIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  const iso = d.toISOString?.();
  return typeof iso === "string" ? iso : null;
}

type AttachmentView = {
  id: string;
  type: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

type OcrView = {
  id: string;
  kind: string;
  mode: string;
  status: string;
  engine: string;
  engineVersion: string | null;
  languageHint: string | null;

  rawText: string | null;
  confidence: number | null;

  parsedContactJson: unknown | null;
  correctedContactJson: unknown | null;

  correctedAt: string | null;
  correctedByUserId: string | null;

  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;

  createdAt: string;
  updatedAt: string;
};

function pickBusinessCardAttachment(attachments: Array<AttachmentView>): AttachmentView | null {
  if (!attachments.length) return null;

  const bc = attachments.find((a) => String(a.type || "").toUpperCase() === "BUSINESS_CARD_IMAGE");
  if (bc) return bc;

  const img = attachments.find((a) => String(a.mimeType || "").toLowerCase().startsWith("image/"));
  return img ?? attachments[0] ?? null;
}

function hasAnyNonEmptyString(obj: Record<string, unknown>): boolean {
  for (const v of Object.values(obj)) {
    if (typeof v === "string" && v.trim().length) return true;
  }
  return false;
}

function stripAllNullishStrings(obj: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  let any = false;

  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string") {
      const t = v.trim();
      if (!t) continue;
      out[k] = t;
      any = true;
      continue;
    }
    out[k] = v;
    any = true;
  }

  return any ? out : null;
}

const ContactSchema = z
  .object({
    firstName: z.string().optional().nullable(),
    lastName: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    mobile: z.string().optional().nullable(),
    company: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    website: z.string().optional().nullable(),
    street: z.string().optional().nullable(),
    zip: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
  })
  .strict();

const PatchBodySchema = z
  .object({
    ocrResultId: z.string().min(1).max(128),
    correctedContact: ContactSchema,
  })
  .strict();

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await resolveAdminCtx(req);
    const { id: leadId } = await context.params;

    // Leak-safe: lead must be tenant-scoped, otherwise 404.
    const lead = await prisma.lead.findFirst({
      where: { tenantId, id: leadId },
      select: {
        id: true,
        contactOcrResultId: true,
        attachments: {
          select: {
            id: true,
            type: true,
            filename: true,
            mimeType: true,
            sizeBytes: true,
          },
          orderBy: { createdAt: "desc" },
        },
        contactOcrResult: {
          select: {
            id: true,
            kind: true,
            mode: true,
            status: true,
            engine: true,
            engineVersion: true,
            languageHint: true,
            rawText: true,
            confidence: true,
            parsedContactJson: true,
            correctedContactJson: true,
            correctedAt: true,
            correctedByUserId: true,
            completedAt: true,
            errorCode: true,
            errorMessage: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!lead) return jsonError(req, 404, "NOT_FOUND", "Lead not found.");

    const attachments: AttachmentView[] = (lead.attachments ?? []).map((a) => ({
      id: a.id,
      type: String(a.type),
      filename: a.filename,
      mimeType: a.mimeType ?? null,
      sizeBytes: typeof a.sizeBytes === "number" ? a.sizeBytes : null,
    }));

    const attachment = pickBusinessCardAttachment(attachments);

    // Prefer applied OCR result if available.
    let ocrRaw = lead.contactOcrResult ?? null;

    // Otherwise: best-effort latest OCR for the business card attachment.
    if (!ocrRaw && attachment?.id) {
      // Prefer COMPLETED if exists
      ocrRaw =
        (await prisma.leadOcrResult.findFirst({
          where: {
            tenantId,
            leadId,
            attachmentId: attachment.id,
            kind: "BUSINESS_CARD",
            status: "COMPLETED",
          },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            kind: true,
            mode: true,
            status: true,
            engine: true,
            engineVersion: true,
            languageHint: true,
            rawText: true,
            confidence: true,
            parsedContactJson: true,
            correctedContactJson: true,
            correctedAt: true,
            correctedByUserId: true,
            completedAt: true,
            errorCode: true,
            errorMessage: true,
            createdAt: true,
            updatedAt: true,
          },
        })) ??
        (await prisma.leadOcrResult.findFirst({
          where: {
            tenantId,
            leadId,
            attachmentId: attachment.id,
            kind: "BUSINESS_CARD",
          },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            kind: true,
            mode: true,
            status: true,
            engine: true,
            engineVersion: true,
            languageHint: true,
            rawText: true,
            confidence: true,
            parsedContactJson: true,
            correctedContactJson: true,
            correctedAt: true,
            correctedByUserId: true,
            completedAt: true,
            errorCode: true,
            errorMessage: true,
            createdAt: true,
            updatedAt: true,
          },
        }));
    }

    const ocr: OcrView | null = ocrRaw
      ? {
          id: ocrRaw.id,
          kind: String(ocrRaw.kind),
          mode: String(ocrRaw.mode),
          status: String(ocrRaw.status),
          engine: String(ocrRaw.engine),
          engineVersion: ocrRaw.engineVersion ?? null,
          languageHint: ocrRaw.languageHint ?? null,
          rawText: ocrRaw.rawText ?? null,
          confidence: typeof ocrRaw.confidence === "number" ? ocrRaw.confidence : null,
          parsedContactJson: ocrRaw.parsedContactJson ?? null,
          correctedContactJson: ocrRaw.correctedContactJson ?? null,
          correctedAt: toIso(ocrRaw.correctedAt) ?? null,
          correctedByUserId: ocrRaw.correctedByUserId ?? null,
          completedAt: toIso(ocrRaw.completedAt) ?? null,
          errorCode: ocrRaw.errorCode ?? null,
          errorMessage: ocrRaw.errorMessage ?? null,
          createdAt: toIso(ocrRaw.createdAt) ?? new Date().toISOString(),
          updatedAt: toIso(ocrRaw.updatedAt) ?? new Date().toISOString(),
        }
      : null;

    return jsonOkCompat(req, { attachment, ocr });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL", "Unexpected server error.");
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, userId } = await resolveAdminCtx(req);
    const { id: leadId } = await context.params;

    // Leak-safe: ensure lead is tenant-scoped.
    const lead = await prisma.lead.findFirst({
      where: { tenantId, id: leadId },
      select: { id: true },
    });
    if (!lead) return jsonError(req, 404, "NOT_FOUND", "Lead not found.");

    const body = await validateBody(req, PatchBodySchema);

    const correctedContact = (body.correctedContact ?? {}) as unknown as Record<string, unknown>;
    const compact = stripAllNullishStrings(correctedContact);

    // Prisma expects InputJsonValue; Record<string, unknown> is not assignable.
    const correctedJsonValue: Prisma.InputJsonValue | null = compact
      ? (compact as unknown as Prisma.InputJsonValue)
      : null;

    // If user saves an entirely empty correction, we interpret it as "clear correction".
    const hasCorrection = Boolean(correctedJsonValue) && hasAnyNonEmptyString(compact ?? {});

    const ocr = await prisma.leadOcrResult.findFirst({
      where: { tenantId, id: body.ocrResultId, leadId },
      select: { id: true },
    });

    if (!ocr) return jsonError(req, 404, "NOT_FOUND", "OCR result not found.");

    const updated = await prisma.leadOcrResult.update({
      where: { id: ocr.id },
      data: {
        // To clear nullable JSON use DbNull (NOT JS null).
        correctedContactJson: hasCorrection ? correctedJsonValue! : Prisma.DbNull,
        correctedAt: hasCorrection ? new Date() : null,
        correctedByUserId: hasCorrection ? userId : null,
      },
      select: {
        id: true,
        kind: true,
        mode: true,
        status: true,
        engine: true,
        engineVersion: true,
        languageHint: true,
        rawText: true,
        confidence: true,
        parsedContactJson: true,
        correctedContactJson: true,
        correctedAt: true,
        correctedByUserId: true,
        completedAt: true,
        errorCode: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const ocrView: OcrView = {
      id: updated.id,
      kind: String(updated.kind),
      mode: String(updated.mode),
      status: String(updated.status),
      engine: String(updated.engine),
      engineVersion: updated.engineVersion ?? null,
      languageHint: updated.languageHint ?? null,
      rawText: updated.rawText ?? null,
      confidence: typeof updated.confidence === "number" ? updated.confidence : null,
      parsedContactJson: updated.parsedContactJson ?? null,
      correctedContactJson: updated.correctedContactJson ?? null,
      correctedAt: toIso(updated.correctedAt) ?? null,
      correctedByUserId: updated.correctedByUserId ?? null,
      completedAt: toIso(updated.completedAt) ?? null,
      errorCode: updated.errorCode ?? null,
      errorMessage: updated.errorMessage ?? null,
      createdAt: toIso(updated.createdAt) ?? new Date().toISOString(),
      updatedAt: toIso(updated.updatedAt) ?? new Date().toISOString(),
    };

    return jsonOkCompat(req, { ok: true, ocr: ocrView });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL", "Unexpected server error.");
  }
}
