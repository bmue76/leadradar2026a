import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateQuery } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { enforceMobileCaptureLicense } from "@/lib/billing/mobileCaptureGate";

export const runtime = "nodejs";

const QuerySchema = z
  .object({
    eventId: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() : ""),
      z.string().min(1).max(64)
    ),
  })
  .strict();

export async function GET(req: Request) {
  try {
    const auth = await requireMobileAuth(req);

    enforceRateLimit(`mobile:${auth.apiKeyId}`, { limit: 60, windowMs: 60_000 });

    // Hardblock: Mobile Capture only
    await enforceMobileCaptureLicense(auth.tenantId);

    const query = await validateQuery(req, QuerySchema);
    const eventId = query.eventId;

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

    // Validate event in tenant; must be ACTIVE
    const ev = await prisma.event.findFirst({
      where: { id: eventId, tenantId: auth.tenantId },
      select: { id: true, status: true },
    });
    if (!ev) throw httpError(404, "NOT_FOUND", "Not found.");
    if (ev.status !== "ACTIVE") throw httpError(409, "EVENT_NOT_ACTIVE", "Event not active.");

    // TP7.10 visibility rule:
    // - assigned to this event (join-table)
    // - OR global (no assignments at all)
    const forms = await prisma.form.findMany({
      where: {
        tenantId: auth.tenantId,
        status: "ACTIVE",
        OR: [
          { eventAssignments: { some: { tenantId: auth.tenantId, eventId } } },
          { eventAssignments: { none: {} } },
        ],
      },
      select: { id: true, name: true, description: true, status: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 200,
    });

    return jsonOk(req, forms);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
