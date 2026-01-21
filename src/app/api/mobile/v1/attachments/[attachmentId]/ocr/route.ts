import { createHash } from "node:crypto";
import { Prisma, type LeadOcrResult } from "@prisma/client";
import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { validateBody, validateQuery, isHttpError, httpError } from "@/lib/http";

export const runtime = "nodejs";

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function sha256Hex(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload), "utf8").digest("hex");
}

function toJsonInput(v: unknown | undefined | null): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (v === undefined || v === null) return Prisma.DbNull;
  return v as Prisma.InputJsonValue;
}

const OcrModeQuerySchema = z
  .object({
    mode: z.enum(["ON_DEVICE_LATIN", "SERVER_FALLBACK"]).optional(),
  })
  .transform((q) => ({ mode: q.mode ?? "ON_DEVICE_LATIN" }));

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

const PutOcrBodySchema = z.object({
  engine: z.enum(["MLKIT"]).optional(),
  engineVersion: z.string().trim().min(1).optional(),
  languageHint: z.string().trim().min(1).optional(),

  rawText: z.string().min(1),
  blocksJson: z.unknown().optional(),
  parsedContact: ContactSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),

  resultHash: z.string().trim().min(1).optional(),
});

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
  };
}

async function updateMobileTelemetry(auth: { apiKeyId: string; deviceId: string }) {
  const now = new Date();
  await prisma.mobileApiKey.update({ where: { id: auth.apiKeyId }, data: { lastUsedAt: now } });
  await prisma.mobileDevice.update({ where: { id: auth.deviceId }, data: { lastSeenAt: now } });
}

export async function GET(req: Request, ctx: { params: { attachmentId: string } }) {
  try {
    const auth = await requireMobileAuth(req);
    enforceRateLimit(`mobile:${auth.apiKeyId}:ocr_get`, { limit: 120, windowMs: 60_000 });

    await updateMobileTelemetry(auth);

    const query = await validateQuery(req, OcrModeQuerySchema);
    const attachmentId = ctx.params.attachmentId;

    const attachment = await prisma.leadAttachment.findFirst({
      where: { id: attachmentId, tenantId: auth.tenantId },
      select: { id: true, type: true },
    });
    if (!attachment) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    if (attachment.type !== "BUSINESS_CARD_IMAGE") {
      return jsonError(req, 409, "INVALID_ATTACHMENT_TYPE", "Attachment is not a business card image.");
    }

    const ocr = await prisma.leadOcrResult.findUnique({
      where: {
        tenantId_attachmentId_mode: {
          tenantId: auth.tenantId,
          attachmentId,
          mode: query.mode,
        },
      },
    });

    return jsonOk(req, { ocr: ocr ? toOcrApiShape(ocr) : null });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function PUT(req: Request, ctx: { params: { attachmentId: string } }) {
  try {
    const auth = await requireMobileAuth(req);
    enforceRateLimit(`mobile:${auth.apiKeyId}:ocr_put`, { limit: 60, windowMs: 60_000 });

    await updateMobileTelemetry(auth);

    const query = await validateQuery(req, OcrModeQuerySchema);
    const body = await validateBody(req, PutOcrBodySchema, 2 * 1024 * 1024);
    const attachmentId = ctx.params.attachmentId;

    const attachment = await prisma.leadAttachment.findFirst({
      where: { id: attachmentId, tenantId: auth.tenantId },
      select: { id: true, type: true, leadId: true },
    });
    if (!attachment) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    if (attachment.type !== "BUSINESS_CARD_IMAGE") {
      return jsonError(req, 409, "INVALID_ATTACHMENT_TYPE", "Attachment is not a business card image.");
    }

    const computedHash =
      body.resultHash ??
      sha256Hex({
        mode: query.mode,
        engine: body.engine ?? "MLKIT",
        engineVersion: body.engineVersion ?? null,
        languageHint: body.languageHint ?? null,
        rawText: body.rawText,
        blocksJson: body.blocksJson ?? null,
        parsedContact: body.parsedContact ?? null,
        confidence: body.confidence ?? null,
      });

    const existing = await prisma.leadOcrResult.findUnique({
      where: {
        tenantId_attachmentId_mode: {
          tenantId: auth.tenantId,
          attachmentId,
          mode: query.mode,
        },
      },
    });

    if (existing?.resultHash && existing.resultHash !== computedHash) {
      throw httpError(
        409,
        "OCR_IDEMPOTENCY_CONFLICT",
        "OCR result already exists for this attachment/mode with different content."
      );
    }

    if (existing?.resultHash && existing.resultHash === computedHash) {
      return jsonOk(req, { ocr: toOcrApiShape(existing), idempotency: "HIT" });
    }

    const now = new Date();

    const ocr = await prisma.leadOcrResult.upsert({
      where: {
        tenantId_attachmentId_mode: {
          tenantId: auth.tenantId,
          attachmentId,
          mode: query.mode,
        },
      },
      create: {
        tenantId: auth.tenantId,
        leadId: attachment.leadId,
        attachmentId,
        kind: "BUSINESS_CARD",

        mode: query.mode,
        status: "COMPLETED",
        engine: "MLKIT",
        engineVersion: body.engineVersion,
        languageHint: body.languageHint,

        rawText: body.rawText,
        blocksJson: toJsonInput(body.blocksJson),
        parsedContactJson: toJsonInput(body.parsedContact ?? null),
        confidence: body.confidence ?? null,

        resultHash: computedHash,
        completedAt: now,
        errorCode: null,
        errorMessage: null,
      },
      update: {
        // IMPORTANT: do not overwrite correctedContactJson/correctedAt/correctedByUserId
        status: "COMPLETED",
        engine: "MLKIT",
        engineVersion: body.engineVersion,
        languageHint: body.languageHint,

        rawText: body.rawText,
        blocksJson: toJsonInput(body.blocksJson),
        parsedContactJson: toJsonInput(body.parsedContact ?? null),
        confidence: body.confidence ?? null,

        resultHash: computedHash,
        completedAt: now,
        errorCode: null,
        errorMessage: null,
      },
    });

    return jsonOk(req, { ocr: toOcrApiShape(ocr), idempotency: "MISS" });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
