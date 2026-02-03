import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await requireMobileAuth(req);

    enforceRateLimit(`mobile:${auth.apiKeyId}`, { limit: 60, windowMs: 60_000 });

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

    const tenant = await prisma.tenant.findFirst({
      where: { id: auth.tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        accentColor: true,
        logoKey: true,
        logoMime: true,
        logoUpdatedAt: true,
      },
    });
    if (!tenant) throw httpError(404, "NOT_FOUND", "Not found.");

    const profile = await prisma.tenantProfile.findUnique({
      where: { tenantId: auth.tenantId },
      select: {
        legalName: true,
        displayName: true,
        accentColor: true,
      },
    });

    const displayName = profile?.displayName ?? null;
    const legalName = profile?.legalName ?? tenant.name;
    const name = displayName ?? legalName ?? tenant.name;

    const accentColor = profile?.accentColor ?? tenant.accentColor ?? null;

    const hasLogo = !!tenant.logoKey && !!tenant.logoMime;

    return jsonOk(req, {
      tenant: {
        slug: tenant.slug,
      },
      branding: {
        name,
        legalName,
        displayName,
        accentColor,
        hasLogo,
        logoMime: hasLogo ? tenant.logoMime : null,
        logoUpdatedAt: tenant.logoUpdatedAt ? tenant.logoUpdatedAt.toISOString() : null,
        logoUrl: hasLogo ? "/api/mobile/v1/branding/logo" : null,
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
