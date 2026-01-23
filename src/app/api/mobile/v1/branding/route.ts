import { readFile } from "node:fs/promises";

import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { fileExists, getAbsolutePath } from "@/lib/storage";

export const runtime = "nodejs";

const BRANDING_ROOT_DIR = ".tmp_branding";

type BrandingOk = {
  branding: {
    hasLogo: boolean;
    logoMime?: string | null;
    logoSizeBytes?: number | null;
    logoUpdatedAt?: string | null;
  };
  logoDataUrl: string | null;
};

async function getTenantLogoDataUrl(tenantId: string): Promise<BrandingOk> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      logoKey: true,
      logoMime: true,
      logoSizeBytes: true,
      logoUpdatedAt: true,
    },
  });

  if (!tenant?.logoKey || !tenant.logoMime) {
    return { branding: { hasLogo: false }, logoDataUrl: null };
  }

  const absPath = getAbsolutePath({ rootDirName: BRANDING_ROOT_DIR, relativeKey: tenant.logoKey });
  const exists = await fileExists(absPath);
  if (!exists) {
    // DB says logo exists, but file missing -> treat as no logo (MVP resilient)
    return { branding: { hasLogo: false }, logoDataUrl: null };
  }

  const buf = await readFile(absPath);
  const base64 = buf.toString("base64");
  const dataUrl = `data:${tenant.logoMime};base64,${base64}`;

  return {
    branding: {
      hasLogo: true,
      logoMime: tenant.logoMime,
      logoSizeBytes: tenant.logoSizeBytes ?? null,
      logoUpdatedAt: tenant.logoUpdatedAt ? tenant.logoUpdatedAt.toISOString() : null,
    },
    logoDataUrl: dataUrl,
  };
}

export async function GET(req: Request) {
  try {
    const auth = await requireMobileAuth(req);

    enforceRateLimit(`mobile:${auth.apiKeyId}`, { limit: 30, windowMs: 60_000 });

    // Ops telemetry
    const now = new Date();
    await prisma.mobileApiKey.update({
      where: { id: auth.apiKeyId },
      data: { lastUsedAt: now },
    });
    await prisma.mobileDevice.update({
      where: { id: auth.deviceId },
      data: { lastSeenAt: now },
    });

    const payload = await getTenantLogoDataUrl(auth.tenantId);
    return jsonOk(req, payload);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
