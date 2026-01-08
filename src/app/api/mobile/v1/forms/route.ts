import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
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

    const assignments = await prisma.mobileDeviceForm.findMany({
      where: {
        tenantId: auth.tenantId,
        deviceId: auth.deviceId,
        form: { status: "ACTIVE" },
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
