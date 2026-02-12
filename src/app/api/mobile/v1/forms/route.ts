import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { enforceMobileCaptureLicense } from "@/lib/billing/mobileCaptureGate";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await requireMobileAuth(req);

    enforceRateLimit(`mobile:${auth.apiKeyId}`, { limit: 60, windowMs: 60_000 });

    // Hardblock: Mobile Capture only
    await enforceMobileCaptureLicense(auth.tenantId);

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

    // Multi-ACTIVE: capture context is per device (MobileDevice.activeEventId)
    // If device not bound OR event not ACTIVE => return []
    const device = await prisma.mobileDevice.findFirst({
      where: { id: auth.deviceId, tenantId: auth.tenantId },
      select: {
        activeEventId: true,
        activeEvent: { select: { id: true, status: true } },
      },
    });
    if (!device?.activeEventId) return jsonOk(req, []);
    if (!device.activeEvent || device.activeEvent.status !== "ACTIVE") return jsonOk(req, []);

    const eventId = device.activeEventId;

    const assignments = await prisma.mobileDeviceForm.findMany({
      where: {
        tenantId: auth.tenantId,
        deviceId: auth.deviceId,
        form: {
          status: "ACTIVE",
          assignedEventId: eventId,
        },
      },
      select: {
        form: {
          select: { id: true, name: true, description: true, status: true },
        },
      },
      orderBy: { form: { createdAt: "desc" } },
      take: 200,
    });

    const forms = assignments.map((a) => a.form);

    return jsonOk(req, forms);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
