import { readFile } from "node:fs/promises";

import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { fileExists, getAbsolutePath } from "@/lib/storage";

export const runtime = "nodejs";

const BRANDING_ROOT_DIR = ".tmp_branding";

type BrandingPayload = {
  branding: {
    hasLogo: boolean;
    logoMime?: string | null;
    logoSizeBytes?: number | null;
    logoUpdatedAt?: string | null;
  };
  logoDataUrl: string | null;
};

async function buildBrandingPayload(tenantId: string): Promise<BrandingPayload> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { logoKey: true, logoMime: true, logoSizeBytes: true, logoUpdatedAt: true },
  });

  if (!t?.logoKey || !t.logoMime) {
    return { branding: { hasLogo: false }, logoDataUrl: null };
  }

  const absPath = getAbsolutePath({ rootDirName: BRANDING_ROOT_DIR, relativeKey: t.logoKey });
  const exists = await fileExists(absPath);
  if (!exists) {
    // resilient MVP: DB says logo, but file missing -> treat as no logo
    return { branding: { hasLogo: false }, logoDataUrl: null };
  }

  try {
    const buf = await readFile(absPath);
    const base64 = buf.toString("base64");
    return {
      branding: {
        hasLogo: true,
        logoMime: t.logoMime,
        logoSizeBytes: t.logoSizeBytes ?? null,
        logoUpdatedAt: t.logoUpdatedAt ? t.logoUpdatedAt.toISOString() : null,
      },
      logoDataUrl: `data:${t.logoMime};base64,${base64}`,
    };
  } catch {
    return { branding: { hasLogo: false }, logoDataUrl: null };
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireMobileAuth(req);

    enforceRateLimit(`mobile:${auth.apiKeyId}`, { limit: 30, windowMs: 60_000 });

    // Ops telemetry (same pattern as forms)
    const now = new Date();
    await prisma.mobileApiKey.update({ where: { id: auth.apiKeyId }, data: { lastUsedAt: now } });
    await prisma.mobileDevice.update({ where: { id: auth.deviceId }, data: { lastSeenAt: now } });

    const payload = await buildBrandingPayload(auth.tenantId);
    return jsonOk(req, payload);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
