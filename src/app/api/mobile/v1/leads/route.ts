import { z } from "zod";
import { Prisma } from "@prisma/client";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { enforceMobileCaptureLicense } from "@/lib/billing/mobileCaptureGate";

const BodySchema = z.object({
  formId: z.string().min(1),
  clientLeadId: z.string().min(1).max(200),
  capturedAt: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await requireMobileAuth(req);

    enforceRateLimit(`mobile:${auth.apiKeyId}`, { limit: 60, windowMs: 60_000 });

    // Hardblock: Mobile Capture only
    await enforceMobileCaptureLicense(auth.tenantId);

    const body = await validateBody(req, BodySchema, 1024 * 1024); // 1MB
    const capturedAt = new Date(body.capturedAt);
    if (Number.isNaN(capturedAt.getTime())) {
      return jsonError(req, 400, "INVALID_BODY", "Invalid request body.", {
        capturedAt: ["Invalid ISO datetime."],
      });
    }

    // Option 2: active event must exist, and device.activeEventId must match it
    const activeEvent = await prisma.event.findFirst({
      where: { tenantId: auth.tenantId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!activeEvent) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const device = await prisma.mobileDevice.findFirst({
      where: { id: auth.deviceId, tenantId: auth.tenantId },
      select: { activeEventId: true },
    });
    if (!device?.activeEventId || device.activeEventId !== activeEvent.id) {
      return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    // leak-safe: require assignment (and ACTIVE form) AND form assigned to active event
    const assignment = await prisma.mobileDeviceForm.findFirst({
      where: {
        tenantId: auth.tenantId,
        deviceId: auth.deviceId,
        formId: body.formId,
        form: { status: "ACTIVE", assignedEventId: activeEvent.id },
      },
      select: { formId: true },
    });
    if (!assignment) {
      return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    // Idempotency: (tenantId, clientLeadId)
    const existing = await prisma.lead.findFirst({
      where: { tenantId: auth.tenantId, clientLeadId: body.clientLeadId },
      select: { id: true },
    });

    if (existing) {
      return jsonOk(req, { leadId: existing.id, deduped: true });
    }

    const valuesJson = body.values as unknown as Prisma.InputJsonValue;
    const metaJson = ({
      ...(body.meta ?? {}),
      source: "mobile",
      mobileDeviceId: auth.deviceId,
      mobileApiKeyPrefix: auth.apiKeyPrefix,
    } as unknown) as Prisma.InputJsonValue;

    const lead = await prisma.lead.create({
      data: {
        tenantId: auth.tenantId,
        formId: body.formId,
        clientLeadId: body.clientLeadId,
        capturedAt,
        values: valuesJson,
        meta: metaJson,
        eventId: activeEvent.id,
      },
      select: { id: true },
    });

    return jsonOk(req, { leadId: lead.id, deduped: false });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
