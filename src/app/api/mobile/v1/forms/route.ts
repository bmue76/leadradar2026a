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

    // Option 2: active event must exist, and device.activeEventId must match it
    const activeEvent = await prisma.event.findFirst({
      where: { tenantId: auth.tenantId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!activeEvent) return jsonOk(req, []);

    const device = await prisma.mobileDevice.findFirst({
      where: { id: auth.deviceId, tenantId: auth.tenantId },
      select: { activeEventId: true },
    });
    if (!device?.activeEventId || device.activeEventId !== activeEvent.id) return jsonOk(req, []);

    const assignments = await prisma.mobileDeviceForm.findMany({
      where: {
        tenantId: auth.tenantId,
        deviceId: auth.deviceId,
        form: {
          status: "ACTIVE",
          assignedEventId: activeEvent.id,
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
