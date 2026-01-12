import { z } from "zod";
import { AttachmentType } from "@prisma/client";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { putBinaryFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 6 * 1024 * 1024; // 6MB
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const TypeSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length ? v : "BUSINESS_CARD_IMAGE"))
  .refine(
    (v) => v === "BUSINESS_CARD_IMAGE" || v === "OTHER" || v === "IMAGE" || v === "PDF",
    "Invalid attachment type."
  );

function extFromMime(mime: string): string | null {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return null;
}

function safeFilename(name: string, fallback: string): string {
  const raw = String(name ?? "").trim();
  if (!raw) return fallback;
  const base = raw.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, 200);
}

type FormDataWithGet = {
  get(name: string): FormDataEntryValue | null;
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
    if (!fileVal || !(fileVal instanceof File)) {
      return jsonError(req, 400, "INVALID_BODY", "Invalid request body.", {
        file: ["Missing file (multipart field 'file')."],
      });
    }

    const typeRaw = form.get("type");
    const typeParsed = TypeSchema.safeParse(typeof typeRaw === "string" ? typeRaw : undefined);
    if (!typeParsed.success) {
      return jsonError(req, 400, "INVALID_BODY", "Invalid request body.", typeParsed.error.flatten());
    }

    const mimeType = String(fileVal.type || "").toLowerCase();
    if (!ALLOWED_MIME.has(mimeType)) {
      return jsonError(req, 400, "INVALID_BODY", "Invalid request body.", {
        mimeType: [`Unsupported mimeType '${mimeType}'. Allowed: ${Array.from(ALLOWED_MIME).join(", ")}`],
      });
    }

    const sizeBytes = fileVal.size;
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return jsonError(req, 400, "INVALID_BODY", "Invalid request body.", { file: ["Empty file."] });
    }
    if (sizeBytes > MAX_BYTES) {
      return jsonError(req, 413, "BODY_TOO_LARGE", "Request body too large.", {
        maxBytes: MAX_BYTES,
        sizeBytes,
      });
    }

    const ext = extFromMime(mimeType);
    if (!ext) {
      return jsonError(req, 400, "INVALID_BODY", "Invalid request body.", {
        mimeType: ["Could not infer file extension."],
      });
    }

    const created = await prisma.leadAttachment.create({
      data: {
        tenantId: auth.tenantId,
        leadId: lead.id,
        type: (typeParsed.data as AttachmentType) ?? "BUSINESS_CARD_IMAGE",
        filename: safeFilename(fileVal.name, `attachment.${ext}`),
        mimeType,
        sizeBytes: Math.trunc(sizeBytes),
        storageKey: null,
      },
      select: { id: true, type: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
    });

    const storageKey = `${auth.tenantId}/${lead.id}/${created.id}.${ext}`;

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

    return jsonOk(req, {
      id: created.id,
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
