import * as crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";
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

// Allow SVG (with basic safety checks). PNG/JPG/WebP as before.
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

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

async function resolveTenantIdFromSession(req: Request): Promise<string> {
  const { tenantId } = await requireAdminAuth(req);

  // Optional explicit override checks (leak-safe)
  const headerTenantId = (req.headers.get("x-tenant-id") ?? "").trim();
  const headerTenantSlug = (req.headers.get("x-tenant-slug") ?? "").trim();

  if (headerTenantId && headerTenantId !== tenantId) {
    // leak-safe mismatch
    throw new Error("NOT_FOUND");
  }

  if (headerTenantSlug) {
    const t = await prisma.tenant.findUnique({ where: { slug: headerTenantSlug }, select: { id: true } });
    if (!t || t.id !== tenantId) throw new Error("NOT_FOUND");
  }

  return tenantId;
}

function extFromMime(mime: string): "png" | "jpg" | "webp" | "svg" {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
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

function securityHeadersForLogo(mime: string): Record<string, string> {
  const base: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  };

  // Extra hardening for SVG.
  if (mime === "image/svg+xml") {
    base["Content-Security-Policy"] = "default-src 'none'; style-src 'none'; script-src 'none'; sandbox";
  }

  return base;
}

// Basic SVG guard: reject common active content vectors.
// (Not a full sanitizer, but good MVP hardening.)
function assertSvgIsSafe(bytes: Uint8Array) {
  const text = Buffer.from(bytes).toString("utf8");

  // Block scripts + foreignObject + event handlers + javascript: links
  if (/<script[\s>]/i.test(text)) throw new Error("SVG_UNSAFE");
  if (/<foreignObject[\s>]/i.test(text)) throw new Error("SVG_UNSAFE");
  if (/\son\w+\s*=/i.test(text)) throw new Error("SVG_UNSAFE");
  if (/javascript:/i.test(text)) throw new Error("SVG_UNSAFE");
}

async function checkHasLogo(tenantId: string): Promise<{ absPath: string; mime: string; etag: string } | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { logoKey: true, logoMime: true },
  });

  if (!tenant?.logoKey || !tenant.logoMime) return null;

  const absPath = getAbsolutePath({ rootDirName: BRANDING_ROOT_DIR, relativeKey: tenant.logoKey });
  const exists = await fileExists(absPath);
  if (!exists) return null;

  const st = await statFile(absPath);
  const etag = etagFrom(st.sizeBytes, st.mtimeMs);

  return { absPath, mime: tenant.logoMime, etag };
}

export async function HEAD(req: Request): Promise<Response> {
  let tenantId: string;
  try {
    tenantId = await resolveTenantIdFromSession(req);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return jsonError({ status: 404, code: "NOT_FOUND", message: "Not found." });
    }
    return jsonError({ status: 401, code: "UNAUTHORIZED", message: "Not authenticated." });
  }

  const found = await checkHasLogo(tenantId);
  if (!found) return jsonError({ status: 404, code: "NOT_FOUND", message: "Logo not found." });

  return new Response(null, {
    status: 200,
    headers: {
      "x-trace-id": makeTraceId(),
      "Cache-Control": "private, max-age=3600",
      ETag: found.etag,
      "Content-Type": found.mime,
      ...securityHeadersForLogo(found.mime),
    },
  });
}

export async function GET(req: Request): Promise<Response> {
  let tenantId: string;
  try {
    tenantId = await resolveTenantIdFromSession(req);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return jsonError({ status: 404, code: "NOT_FOUND", message: "Not found." });
    }
    return jsonError({ status: 401, code: "UNAUTHORIZED", message: "Not authenticated." });
  }

  const found = await checkHasLogo(tenantId);
  if (!found) return jsonError({ status: 404, code: "NOT_FOUND", message: "Logo not found." });

  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === found.etag) {
    return new Response(null, {
      status: 304,
      headers: {
        "x-trace-id": makeTraceId(),
        "Cache-Control": "private, max-age=3600",
        ETag: found.etag,
        ...securityHeadersForLogo(found.mime),
      },
    });
  }

  const body = streamFileWeb(found.absPath);

  return new Response(body, {
    status: 200,
    headers: {
      "x-trace-id": makeTraceId(),
      "Content-Type": found.mime,
      "Cache-Control": "private, max-age=3600",
      ETag: found.etag,
      ...securityHeadersForLogo(found.mime),
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  let tenantId: string;
  try {
    tenantId = await resolveTenantIdFromSession(req);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return jsonError({ status: 404, code: "NOT_FOUND", message: "Not found." });
    }
    return jsonError({ status: 401, code: "UNAUTHORIZED", message: "Not authenticated." });
  }

  const form = await req.formData();
  const file = (form as unknown as { get: (name: string) => unknown }).get("file");

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
      message: "Unsupported file type. Allowed: PNG, JPG, WebP, SVG.",
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
    where: { id: tenantId },
    select: { logoKey: true },
  });

  const ext = extFromMime(mime);
  const key = `tenants/${tenantId}/branding/logo-${crypto.randomUUID()}.${ext}`;

  // NO image transformation!
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (mime === "image/svg+xml") {
    try {
      assertSvgIsSafe(bytes);
    } catch {
      return jsonError({
        status: 400,
        code: "INVALID_SVG",
        message: "SVG enthält potentiell unsichere Inhalte (script/handlers/foreignObject). Bitte als PNG exportieren.",
      });
    }
  }

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
  let tenantId: string;
  try {
    tenantId = await resolveTenantIdFromSession(req);
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return jsonError({ status: 404, code: "NOT_FOUND", message: "Not found." });
    }
    return jsonError({ status: 401, code: "UNAUTHORIZED", message: "Not authenticated." });
  }

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

  return jsonOk({
    branding: { hasLogo: false, logoUpdatedAt: updatedAt.toISOString() },
  });
}
