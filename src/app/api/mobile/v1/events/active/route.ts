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
    await prisma.mobileApiKey.update({
      where: { id: auth.apiKeyId },
      data: { lastUsedAt: now },
    });
    await prisma.mobileDevice.update({
      where: { id: auth.deviceId },
      data: { lastSeenAt: now },
    });

    // Leak-safe device scope check
    const device = await prisma.mobileDevice.findFirst({
      where: { id: auth.deviceId, tenantId: auth.tenantId },
      select: { activeEventId: true },
    });
    if (!device) throw httpError(404, "NOT_FOUND", "Not found.");

    if (!device.activeEventId) {
      return jsonOk(req, { activeEvent: null });
    }

    // Fetch active event (if it exists under this tenant)
    const activeEvent = await prisma.event.findFirst({
      where: { id: device.activeEventId, tenantId: auth.tenantId },
      select: {
        id: true,
        name: true,
        startsAt: true,
        endsAt: true,
        location: true,
      },
    });

    return jsonOk(req, { activeEvent: activeEvent ?? null });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
