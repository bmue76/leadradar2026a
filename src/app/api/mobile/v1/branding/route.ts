import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

type BrandingPayload = {
  tenant: { id: string; slug: string; name: string };
  branding: {
    hasLogo: boolean;
    logoMime?: string | null;
    logoSizeBytes?: number | null;
    logoUpdatedAt?: string | null;
  };
  // JSON endpoint that returns { mime, base64 }
  logoBase64Url: string | null;
};

export async function GET(req: Request) {
  try {
    const auth = await requireMobileAuth(req);

    enforceRateLimit(`mobile:${auth.apiKeyId}`, { limit: 30, windowMs: 60_000 });

    // Ops telemetry
    const now = new Date();
    await prisma.mobileApiKey.update({ where: { id: auth.apiKeyId }, data: { lastUsedAt: now } });
    await prisma.mobileDevice.update({ where: { id: auth.deviceId }, data: { lastSeenAt: now } });

    const t = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        logoKey: true,
        logoMime: true,
        logoSizeBytes: true,
        logoUpdatedAt: true,
      },
    });

    if (!t) {
      const payload: BrandingPayload = {
        tenant: { id: auth.tenantId, slug: "unknown", name: "Unknown" },
        branding: { hasLogo: false },
        logoBase64Url: null,
      };
      return jsonOk(req, payload);
    }

    const hasLogo = Boolean(t.logoKey && t.logoMime);

    const payload: BrandingPayload = {
      tenant: { id: t.id, slug: t.slug, name: t.name },
      branding: hasLogo
        ? {
            hasLogo: true,
            logoMime: t.logoMime,
            logoSizeBytes: t.logoSizeBytes ?? null,
            logoUpdatedAt: t.logoUpdatedAt ? t.logoUpdatedAt.toISOString() : null,
          }
        : { hasLogo: false },
      logoBase64Url: hasLogo ? "/api/mobile/v1/branding/logo-base64" : null,
    };

    return jsonOk(req, payload);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
