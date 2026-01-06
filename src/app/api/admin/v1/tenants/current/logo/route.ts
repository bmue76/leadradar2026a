import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, getTraceId } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { requireTenantContext } from "@/lib/tenantContext";
import {
  deleteFileIfExists,
  fileExists,
  getAbsolutePath,
  putBinaryFile,
  statFile,
  streamFileWeb,
} from "@/lib/storage";

export const runtime = "nodejs";

const BRANDING_ROOT_DIR = ".tmp_branding";
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);

function extFromMime(mime: string): "png" | "jpg" | "webp" | "svg" {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    default:
      return "png";
  }
}

function etagFrom(sizeBytes: number, mtimeMs: number): string {
  return `W/"${sizeBytes}-${Math.floor(mtimeMs)}"`;
}

export async function GET(req: Request): Promise<Response> {
  const traceId = getTraceId(req);

  try {
    const { tenantId } = await requireTenantContext(req);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logoKey: true, logoMime: true },
    });

    if (!tenant?.logoKey || !tenant.logoMime) {
      return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    const absPath = getAbsolutePath({ rootDirName: BRANDING_ROOT_DIR, relativeKey: tenant.logoKey });
    const exists = await fileExists(absPath);
    if (!exists) {
      return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    const st = await statFile(absPath);
    const etag = etagFrom(st.sizeBytes, st.mtimeMs);

    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          "x-trace-id": traceId,
          ETag: etag,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    const body = streamFileWeb(absPath);

    return new Response(body, {
      status: 200,
      headers: {
        "x-trace-id": traceId,
        "Content-Type": tenant.logoMime,
        "Cache-Control": "private, max-age=3600",
        ETag: etag,
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Internal error.");
  }
}

const UploadGuard = z.object({
  // placeholder schema: multipart validation happens via runtime checks below
});

export async function POST(req: Request): Promise<Response> {
  try {
    await UploadGuard.parseAsync({});

    const { tenantId } = await requireTenantContext(req);

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return jsonError(req, 400, "INVALID_BODY", 'Missing "file" in multipart/form-data.');
    }

    const mime = (file.type || "").trim();
    if (!ALLOWED_MIMES.has(mime)) {
      return jsonError(req, 400, "INVALID_FILE_TYPE", "Unsupported file type. Allowed: PNG, JPG, WebP, SVG.", { mime });
    }

    if (file.size > MAX_LOGO_BYTES) {
      return jsonError(req, 413, "BODY_TOO_LARGE", `File too large. Max ${MAX_LOGO_BYTES} bytes.`, { size: file.size });
    }

    const current = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logoKey: true },
    });

    const ext = extFromMime(mime);
    const key = `tenants/${tenantId}/branding/logo-${crypto.randomUUID()}.${ext}`;

    // NO image transformation!
    const bytes = new Uint8Array(await file.arrayBuffer());

    const stored = await putBinaryFile({
      rootDirName: BRANDING_ROOT_DIR,
      relativeKey: key,
      data: bytes,
    });

    const updatedAt = new Date();

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        logoKey: key,
        logoMime: mime === "image/jpg" ? "image/jpeg" : mime,
        logoSizeBytes: stored.sizeBytes,
        logoOriginalName: file.name || null,
        logoUpdatedAt: updatedAt,
        logoWidth: null,
        logoHeight: null,
      },
      select: { id: true },
    });

    if (current?.logoKey && current.logoKey !== key) {
      await deleteFileIfExists({ rootDirName: BRANDING_ROOT_DIR, relativeKey: current.logoKey });
    }

    return jsonOk(req, {
      branding: {
        hasLogo: true,
        logoMime: mime,
        logoSizeBytes: stored.sizeBytes,
        logoUpdatedAt: updatedAt.toISOString(),
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function DELETE(req: Request): Promise<Response> {
  try {
    const { tenantId } = await requireTenantContext(req);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logoKey: true },
    });

    if (tenant?.logoKey) {
      await deleteFileIfExists({ rootDirName: BRANDING_ROOT_DIR, relativeKey: tenant.logoKey });
    }

    const updatedAt = new Date();

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        logoKey: null,
        logoMime: null,
        logoSizeBytes: null,
        logoOriginalName: null,
        logoUpdatedAt: updatedAt,
        logoWidth: null,
        logoHeight: null,
      },
      select: { id: true },
    });

    return jsonOk(req, {
      branding: { hasLogo: false, logoUpdatedAt: updatedAt.toISOString() },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
