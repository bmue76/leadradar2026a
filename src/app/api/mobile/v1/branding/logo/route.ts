import * as crypto from "node:crypto";
import { jsonError } from "@/lib/api";
import { httpError, isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { fileExists, getAbsolutePath, statFile, streamFileWeb } from "@/lib/storage";

export const runtime = "nodejs";

const BRANDING_ROOT_DIR = ".tmp_branding";

function makeTraceId(): string {
  return crypto.randomUUID();
}

function etagFrom(sizeBytes: number, mtimeMs: number): string {
  return `W/"${sizeBytes}-${Math.floor(mtimeMs)}"`;
}

async function resolveLogo(tenantId: string): Promise<{ absPath: string; mime: string; etag: string } | null> {
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
  try {
    const auth = await requireMobileAuth(req);

    enforceRateLimit(`mobile:${auth.apiKeyId}`, { limit: 120, windowMs: 60_000 });

    // Ops telemetry
    const now = new Date();
    await prisma.mobileApiKey.update({ where: { id: auth.apiKeyId }, data: { lastUsedAt: now } });
    await prisma.mobileDevice.update({ where: { id: auth.deviceId }, data: { lastSeenAt: now } });

    // Leak-safe device scope check
    const device = await prisma.mobileDevice.findFirst({
      where: { id: auth.deviceId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!device) throw httpError(404, "NOT_FOUND", "Not found.");

    const found = await resolveLogo(auth.tenantId);
    if (!found) throw httpError(404, "NOT_FOUND", "Not found.");

    return new Response(null, {
      status: 200,
      headers: {
        "x-trace-id": makeTraceId(),
        "Content-Type": found.mime,
        "Cache-Control": "private, max-age=3600",
        ETag: found.etag,
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function GET(req: Request): Promise<Response> {
  try {
    const auth = await requireMobileAuth(req);

    enforceRateLimit(`mobile:${auth.apiKeyId}`, { limit: 120, windowMs: 60_000 });

    // Ops telemetry
    const now = new Date();
    await prisma.mobileApiKey.update({ where: { id: auth.apiKeyId }, data: { lastUsedAt: now } });
    await prisma.mobileDevice.update({ where: { id: auth.deviceId }, data: { lastSeenAt: now } });

    // Leak-safe device scope check
    const device = await prisma.mobileDevice.findFirst({
      where: { id: auth.deviceId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!device) throw httpError(404, "NOT_FOUND", "Not found.");

    const found = await resolveLogo(auth.tenantId);
    if (!found) throw httpError(404, "NOT_FOUND", "Not found.");

    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === found.etag) {
      return new Response(null, {
        status: 304,
        headers: {
          "x-trace-id": makeTraceId(),
          "Cache-Control": "private, max-age=3600",
          ETag: found.etag,
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
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
