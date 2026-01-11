export const runtime = "nodejs";

import { z } from "zod";
import { AttachmentType } from "@prisma/client";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { putBinaryFile } from "@/lib/storage";

const MAX_BYTES = 6 * 1024 * 1024; // 6MB

const AllowedMime = new Set<string>(["image/jpeg", "image/png", "image/webp"]);

const TypeSchema = z.nativeEnum(AttachmentType);

function isFileValue(v: FormDataEntryValue | null): v is File {
  // In Next route handlers (nodejs runtime), File is available via undici.
  // We guard anyway for safety.
  // eslint-disable-next-line no-undef
  return typeof File !== "undefined" && v instanceof File;
}

function sanitizeFilename(input: string): string {
  const raw = (input ?? "").trim();
  const base = raw.split("/").pop()?.split("\\").pop() ?? "upload";
  const cleaned = base.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 180) : "upload";
}

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const auth = await requireMobileAuth(req);

    enforceRateLimit(`mobile:${auth.apiKeyId}:attachments`, { limit: 60, windowMs: 60_000 });

    const leadId = String(ctx?.params?.id ?? "").trim();
    if (!leadId) {
      return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    // leak-safe: lead must exist in tenant
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!lead) {
      return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    const form = await req.formData();

    const fileVal = form.get("file");
    if (!isFileValue(fileVal)) {
      throw httpError(400, "INVALID_BODY", "Invalid request body.", { file: ["Required file upload."] });
    }

    const mimeType = String(fileVal.type ?? "").trim().toLowerCase();
    if (!mimeType || !AllowedMime.has(mimeType)) {
      throw httpError(415, "UNSUPPORTED_MEDIA_TYPE", "Unsupported file type.", {
        mimeType: Array.from(AllowedMime.values()),
      });
    }

    const sizeBytes = Number(fileVal.size ?? 0);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw httpError(400, "INVALID_BODY", "Invalid request body.", { file: ["Empty file."] });
    }
    if (sizeBytes > MAX_BYTES) {
      throw httpError(413, "BODY_TOO_LARGE", "File too large.", { maxBytes: MAX_BYTES });
    }

    const typeRaw = form.get("type");
    let type: AttachmentType = AttachmentType.BUSINESS_CARD_IMAGE;

    if (typeof typeRaw === "string" && typeRaw.trim()) {
      const parsed = TypeSchema.safeParse(typeRaw.trim());
      if (!parsed.success) {
        throw httpError(400, "INVALID_BODY", "Invalid request body.", {
          type: ["Invalid attachment type."],
          allowed: Object.values(AttachmentType),
        });
      }
      type = parsed.data;
    } else if (typeRaw !== null && typeRaw !== undefined) {
      // If present but not a string -> invalid
      throw httpError(400, "INVALID_BODY", "Invalid request body.", { type: ["Invalid attachment type."] });
    }

    const originalName = sanitizeFilename(fileVal.name || "upload");
    const ext = extFromMime(mimeType);

    // Create DB record first to get attachmentId
    const created = await prisma.leadAttachment.create({
      data: {
        tenantId: auth.tenantId,
        leadId: lead.id,
        type,
        filename: originalName,
        mimeType,
        sizeBytes,
        storageKey: null,
      },
      select: {
        id: true,
        type: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });

    const storageKey = `${auth.tenantId}/${lead.id}/${created.id}.${ext}`;

    try {
      await prisma.leadAttachment.update({
        where: { id: created.id },
        data: { storageKey },
      });

      const buf = new Uint8Array(await fileVal.arrayBuffer());

      await putBinaryFile({
        rootDirName: ".tmp_attachments",
        relativeKey: storageKey,
        data: buf,
      });
    } catch (e) {
      // Best-effort cleanup
      try {
        await prisma.leadAttachment.delete({ where: { id: created.id } });
      } catch {
        // ignore cleanup failures
      }
      throw e;
    }

    return jsonOk(req, {
      attachment: {
        id: created.id,
        type: created.type,
        filename: created.filename,
        mimeType: created.mimeType,
        sizeBytes: created.sizeBytes,
        createdAt: created.createdAt.toISOString(),
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
