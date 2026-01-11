import { z } from "zod";
import { Prisma } from "@prisma/client";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";

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

    const body = await validateBody(req, BodySchema, 1024 * 1024); // 1MB
    const capturedAt = new Date(body.capturedAt);
    if (Number.isNaN(capturedAt.getTime())) {
      return jsonError(req, 400, "INVALID_BODY", "Invalid request body.", {
        capturedAt: ["Invalid ISO datetime."],
      });
    }

    // leak-safe: require assignment (and ACTIVE form) for lead capture
    const assignment = await prisma.mobileDeviceForm.findFirst({
      where: {
        tenantId: auth.tenantId,
        deviceId: auth.deviceId,
        formId: body.formId,
        form: { status: "ACTIVE" },
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

    // TP 3.3 — Event tagging:
    // 1) If device.activeEventId set AND event is ACTIVE => use it
    // 2) Else fallback (as in your current behavior): first ACTIVE event (createdAt asc)
    let eventId: string | null = null;

    const device = await prisma.mobileDevice.findFirst({
      where: { id: auth.deviceId, tenantId: auth.tenantId },
      select: {
        id: true,
        activeEventId: true,
        activeEvent: { select: { id: true, status: true } },
      },
    });

    if (device?.activeEventId && device.activeEvent?.status === "ACTIVE") {
      eventId = device.activeEventId;
    } else {
      const firstActive = await prisma.event.findFirst({
        where: { tenantId: auth.tenantId, status: "ACTIVE" },
        orderBy: [{ createdAt: "asc" }],
        select: { id: true },
      });
      if (firstActive) eventId = firstActive.id;
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

        ...(eventId ? { eventId } : {}),
      },
      select: { id: true },
    });

    return jsonOk(req, { leadId: lead.id, deduped: false });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
