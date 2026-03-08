import { z } from "zod";
import { Prisma } from "@prisma/client";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { enforceMobileCaptureLicense } from "@/lib/billing/mobileCaptureGate";

export const runtime = "nodejs";

const BodySchema = z
  .object({
    clientLeadId: z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().min(1).max(64)),
    formId: z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().min(1).max(64)),
    capturedAt: z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().min(1).max(64)),
    eventId: z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().min(1).max(64)),
    values: z.record(z.string(), z.unknown()),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseIsoDateOrThrow(v: string): Date {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw httpError(400, "INVALID_BODY", "Invalid request body.", { capturedAt: "invalid_date" });
  }
  return d;
}

function pickPrismaCode(e: unknown): string | undefined {
  // PrismaClientKnownRequestError has .code like "P2002"
  if (!isRecord(e)) return undefined;
  const code = e["code"];
  return typeof code === "string" ? code : undefined;
}

function toJsonInput(v: unknown, fieldName: string): Prisma.InputJsonValue {
  try {
    // Remove undefined / functions; ensure strict JSON serializability
    return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
  } catch {
    throw httpError(400, "INVALID_BODY", "Invalid request body.", { [fieldName]: "not_json_serializable" });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireMobileAuth(req);

    enforceRateLimit(`mobile:${auth.apiKeyId}`, { limit: 60, windowMs: 60_000 });

    await enforceMobileCaptureLicense(auth.tenantId);

    // Ops telemetry (like events/active)
    const now = new Date();
    await prisma.mobileApiKey.update({ where: { id: auth.apiKeyId }, data: { lastUsedAt: now } });
    await prisma.mobileDevice.update({ where: { id: auth.deviceId }, data: { lastSeenAt: now } });

    const body = await validateBody(req, BodySchema);

    const clientLeadId = body.clientLeadId;
    const formId = body.formId;
    const eventId = body.eventId;
    const capturedAt = parseIsoDateOrThrow(body.capturedAt);

    const valuesJson = toJsonInput(body.values, "values");
    const metaObj = {
      ...(isRecord(body.meta) ? body.meta : {}),
      eventId,
      capturedByDeviceId: auth.deviceId,
    };
    const metaJson = toJsonInput(metaObj, "meta");

    // Validate event (tenant-scoped) must be ACTIVE
    const ev = await prisma.event.findFirst({
      where: { id: eventId, tenantId: auth.tenantId },
      select: { id: true, status: true },
    });
    if (!ev) throw httpError(404, "NOT_FOUND", "Not found.");
    if (ev.status !== "ACTIVE") throw httpError(409, "EVENT_NOT_ACTIVE", "Event not active.");

    // Visibility rule (same as form detail):
    // assigned to event OR global
    const form = await prisma.form.findFirst({
      where: {
        id: formId,
        tenantId: auth.tenantId,
        status: "ACTIVE",
        OR: [
          { eventAssignments: { some: { tenantId: auth.tenantId, eventId } } },
          { eventAssignments: { none: {} } },
        ],
      },
      select: { id: true },
    });
    if (!form) throw httpError(404, "NOT_FOUND", "Not found.");

    // Idempotency: (tenantId, clientLeadId)
    const existing = await prisma.lead.findFirst({
      where: { tenantId: auth.tenantId, clientLeadId },
      select: { id: true },
    });
    if (existing) {
      return jsonOk(req, { leadId: existing.id, deduped: true });
    }

    try {
      // IMPORTANT: store eventId on lead (Admin lists are often event-scoped)
      const created = await prisma.lead.create({
        data: {
          tenantId: auth.tenantId,
          formId,
          eventId,
          clientLeadId,
          capturedAt,
          values: valuesJson,
          meta: metaJson,
        },
        select: { id: true },
      });

      return jsonOk(req, { leadId: created.id, deduped: false });
    } catch (e) {
      // Race: unique constraint (P2002) => fetch existing and return deduped
      if (pickPrismaCode(e) === "P2002") {
        const again = await prisma.lead.findFirst({
          where: { tenantId: auth.tenantId, clientLeadId },
          select: { id: true },
        });
        if (again) return jsonOk(req, { leadId: again.id, deduped: true });
        throw httpError(409, "KEY_CONFLICT", "Lead already exists.");
      }
      throw e;
    }
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
