import { NextRequest } from "next/server";
import { z } from "zod";
import { AttachmentType } from "@prisma/client";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { putBinaryFile, deleteFileIfExists } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MB = 1024 * 1024;

const MAX_BYTES_BY_MIME: Record<string, number> = {
  // Images
  "image/jpeg": 6 * MB,
  "image/png": 6 * MB,
  "image/webp": 6 * MB,

  // PDF
  "application/pdf": 12 * MB,

  // Audio (voice notes)
  "audio/mpeg": 12 * MB, // mp3
  "audio/mp4": 12 * MB, // m4a (commonly reported as audio/mp4)
  "audio/x-m4a": 12 * MB,
  "audio/aac": 12 * MB,
  "audio/wav": 12 * MB,
  "audio/webm": 12 * MB,
  "audio/ogg": 12 * MB,
  "audio/opus": 12 * MB,
  "audio/3gpp": 12 * MB, // 3gp
};

const ALLOWED_MIME = new Set(Object.keys(MAX_BYTES_BY_MIME));

const TypeSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length ? v : undefined))
  .refine(
    (v) =>
      v === undefined ||
      v === "BUSINESS_CARD_IMAGE" ||
      v === "OTHER" ||
      v === "IMAGE" ||
      v === "PDF",
    "Invalid attachment type.",
  );

function maxBytesForMime(mime: string): number | null {
  return MAX_BYTES_BY_MIME[mime] ?? null;
}

function mimeFromFilename(filename: string): string | null {
  const lower = String(filename ?? "").trim().toLowerCase();
  if (!lower) return null;
  const ext = lower.split(".").pop() ?? "";
  if (!ext) return null;

  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    webm: "audio/webm",
    ogg: "audio/ogg",
    opus: "audio/opus",
    "3gp": "audio/3gpp",
  };

  const mime = map[ext];
  if (!mime) return null;
  return ALLOWED_MIME.has(mime) ? mime : null;
}

function extFromMime(mime: string): string | null {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "application/pdf") return "pdf";
  if (mime === "audio/mpeg") return "mp3";
  if (mime === "audio/mp4" || mime === "audio/x-m4a") return "m4a";
  if (mime === "audio/aac") return "aac";
  if (mime === "audio/wav") return "wav";
  if (mime === "audio/webm") return "webm";
  if (mime === "audio/ogg") return "ogg";
  if (mime === "audio/opus") return "opus";
  if (mime === "audio/3gpp") return "3gp";
  return null;
}

function inferTypeFromMime(mime: string): AttachmentType {
  if (mime.startsWith("image/")) return "BUSINESS_CARD_IMAGE";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("audio/")) return "OTHER";
  return "OTHER";
}

function safeFilename(name: string, fallback: string): string {
  const raw = String(name ?? "").trim();
  if (!raw) return fallback;
  const base = raw.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, 200);
}

type FormDataWithGet = { get(name: string): FormDataEntryValue | null };

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: leadId } = await ctx.params;

    const auth = await requireMobileAuth(req);
    enforceRateLimit(`mobile:${auth.apiKeyId}`, { limit: 60, windowMs: 60_000 });

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!lead) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const form = (await req.formData()) as unknown as FormDataWithGet;

    const fileVal = form.get("file");
    if (!(fileVal instanceof File)) {
      return jsonError(req, 400, "INVALID_BODY", "Invalid request body.", {
        file: ["Missing file (multipart field 'file')."],
      });
    }

    const typeRaw = form.get("type");
    const typeParsed = TypeSchema.safeParse(typeof typeRaw === "string" ? typeRaw : undefined);
    if (!typeParsed.success) {
      return jsonError(req, 400, "INVALID_BODY", "Invalid request body.", typeParsed.error.flatten());
    }

    let mimeType = String(fileVal.type || "").trim().toLowerCase();
    if (!mimeType) {
      const inferred = mimeFromFilename(fileVal.name);
      if (inferred) mimeType = inferred;
    }

    if (!ALLOWED_MIME.has(mimeType)) {
      return jsonError(req, 415, "UNSUPPORTED_MEDIA_TYPE", "Unsupported mimeType.", {
        mimeType: mimeType || "(empty)",
        allowed: Array.from(ALLOWED_MIME),
      });
    }

    const sizeBytes = fileVal.size;
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return jsonError(req, 400, "INVALID_BODY", "Invalid request body.", { file: ["Empty file."] });
    }

    const maxBytes = maxBytesForMime(mimeType);
    if (!maxBytes) {
      return jsonError(req, 415, "UNSUPPORTED_MEDIA_TYPE", "Unsupported mimeType.", {
        mimeType,
        allowed: Array.from(ALLOWED_MIME),
      });
    }

    if (sizeBytes > maxBytes) {
      return jsonError(req, 413, "BODY_TOO_LARGE", "Request body too large.", {
        maxBytes,
        sizeBytes,
        mimeType,
      });
    }

    const ext = extFromMime(mimeType);
    if (!ext) {
      return jsonError(req, 400, "INVALID_BODY", "Invalid request body.", {
        mimeType: ["Could not infer file extension."],
      });
    }

    const inferredType = inferTypeFromMime(mimeType);
    const effectiveType = (typeParsed.data as AttachmentType | undefined) ?? inferredType;

    // Optional consistency check: PDF type must be application/pdf, images must be image/*
    if (effectiveType === "PDF" && mimeType !== "application/pdf") {
      return jsonError(req, 400, "INVALID_BODY", "Invalid request body.", {
        type: ["Type PDF requires mimeType application/pdf."],
        mimeType,
      });
    }
    if (
      (effectiveType === "BUSINESS_CARD_IMAGE" || effectiveType === "IMAGE") &&
      !mimeType.startsWith("image/")
    ) {
      return jsonError(req, 400, "INVALID_BODY", "Invalid request body.", {
        type: ["Image type requires an image/* mimeType."],
        mimeType,
      });
    }

    const created = await prisma.leadAttachment.create({
      data: {
        tenantId: auth.tenantId,
        leadId: lead.id,
        type: effectiveType,
        filename: safeFilename(fileVal.name, `attachment.${ext}`),
        mimeType,
        sizeBytes: Math.trunc(sizeBytes),
        storageKey: null,
      },
      select: { id: true, type: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
    });

    const storageKey = `${auth.tenantId}/${lead.id}/${created.id}.${ext}`;

    try {
      const buf = new Uint8Array(await fileVal.arrayBuffer());
      await putBinaryFile({
        rootDirName: ".tmp_attachments",
        relativeKey: storageKey,
        data: buf,
      });

      await prisma.leadAttachment.update({
        where: { id: created.id },
        data: { storageKey },
      });
    } catch (e) {
      await prisma.leadAttachment.delete({ where: { id: created.id } }).catch(() => undefined);
      await deleteFileIfExists({ rootDirName: ".tmp_attachments", relativeKey: storageKey }).catch(() => undefined);
      throw e;
    }

    return jsonOk(req, {
      attachmentId: created.id,
      type: created.type,
      filename: created.filename,
      mimeType: created.mimeType,
      sizeBytes: created.sizeBytes,
      createdAt: created.createdAt.toISOString(),
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
