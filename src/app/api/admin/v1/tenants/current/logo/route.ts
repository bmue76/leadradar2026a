import * as crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  deleteFileIfExists,
  fileExists,
  getAbsolutePath,
  putBinaryFile,
  statFile,
  streamFileWeb,
} from "@/lib/storage";
import { requireTenantContext } from "@/lib/tenantContext";

export const runtime = "nodejs";

const BRANDING_ROOT_DIR = ".tmp_branding";
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

type JsonErrorArgs = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
};

function makeTraceId(): string {
  return crypto.randomUUID();
}

function jsonOk(data: unknown, init?: ResponseInit): Response {
  const traceId = makeTraceId();
  const headers = new Headers(init?.headers);
  headers.set("x-trace-id", traceId);
  headers.set("Cache-Control", "no-store, must-revalidate");
  return Response.json({ ok: true, data, traceId }, { ...init, headers });
}

function jsonError(args: JsonErrorArgs): Response {
  const traceId = makeTraceId();
  const headers = new Headers();
  headers.set("x-trace-id", traceId);
  headers.set("Cache-Control", "no-store, must-revalidate");
  return Response.json(
    {
      ok: false,
      error: { code: args.code, message: args.message, details: args.details ?? null },
      traceId,
    },
    { status: args.status, headers },
  );
}

function extFromMime(mime: string): "png" | "jpg" | "webp" {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

function etagFrom(sizeBytes: number, mtimeMs: number): string {
  return `W/"${sizeBytes}-${Math.floor(mtimeMs)}"`;
}

export async function GET(req: Request): Promise<Response> {
  const traceId = makeTraceId();
  const ctx = requireTenantContext(req);

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { logoKey: true, logoMime: true },
  });

  if (!tenant?.logoKey || !tenant.logoMime) {
    return jsonError({ status: 404, code: "NOT_FOUND", message: "Logo not found." });
  }

  const absPath = getAbsolutePath({ rootDirName: BRANDING_ROOT_DIR, relativeKey: tenant.logoKey });
  const exists = await fileExists(absPath);
  if (!exists) {
    return jsonError({ status: 404, code: "NOT_FOUND", message: "Logo not found." });
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
}

export async function POST(req: Request): Promise<Response> {
  const ctx = requireTenantContext(req);

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return jsonError({
      status: 400,
      code: "INVALID_BODY",
      message: 'Missing "file" in multipart/form-data.',
    });
  }

  const mime = file.type || "";
  if (!ALLOWED_MIMES.has(mime)) {
    return jsonError({
      status: 400,
      code: "INVALID_FILE_TYPE",
      message: "Unsupported file type. Allowed: PNG, JPG, WebP.",
      details: { mime },
    });
  }

  if (file.size > MAX_LOGO_BYTES) {
    return jsonError({
      status: 413,
      code: "BODY_TOO_LARGE",
      message: `File too large. Max ${MAX_LOGO_BYTES} bytes.`,
      details: { size: file.size },
    });
  }

  const current = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { logoKey: true },
  });

  const ext = extFromMime(mime);
  const key = `tenants/${ctx.tenantId}/branding/logo-${crypto.randomUUID()}.${ext}`;

  // NO image transformation!
  const bytes = new Uint8Array(await file.arrayBuffer());

  const stored = await putBinaryFile({
    rootDirName: BRANDING_ROOT_DIR,
    relativeKey: key,
    data: bytes,
  });

  const updatedAt = new Date();

  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: {
      logoKey: key,
      logoMime: mime,
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

  return jsonOk({
    branding: {
      hasLogo: true,
      logoMime: mime,
      logoSizeBytes: stored.sizeBytes,
      logoUpdatedAt: updatedAt.toISOString(),
    },
  });
}

export async function DELETE(req: Request): Promise<Response> {
  const ctx = requireTenantContext(req);

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { logoKey: true },
  });

  if (tenant?.logoKey) {
    await deleteFileIfExists({ rootDirName: BRANDING_ROOT_DIR, relativeKey: tenant.logoKey });
  }

  const updatedAt = new Date();

  await prisma.tenant.update({
    where: { id: ctx.tenantId },
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

  return jsonOk({
    branding: { hasLogo: false, logoUpdatedAt: updatedAt.toISOString() },
  });
}
