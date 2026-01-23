import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateQuery } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

export const runtime = "nodejs";

const QuerySchema = z.object({
  range: z.enum(["today"]).default("today"),
  tzOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional(),
});

function getTodayBoundsUtc(nowUtc: Date, tzOffsetMinutes: number) {
  // tzOffsetMinutes follows JS Date.getTimezoneOffset() semantics (e.g. CET winter = -60)
  // localNow = utcNow - offsetMinutes
  const localNow = new Date(nowUtc.getTime() - tzOffsetMinutes * 60_000);

  const y = localNow.getUTCFullYear();
  const m = localNow.getUTCMonth();
  const d = localNow.getUTCDate();

  // "local midnight" expressed as UTC timestamp in the shifted-local coordinate system
  const localMidnightAsUtcMs = Date.UTC(y, m, d, 0, 0, 0, 0);

  // Convert that local-midnight back to real UTC by adding the offset
  const startUtc = new Date(localMidnightAsUtcMs + tzOffsetMinutes * 60_000);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60_000);

  return { startUtc, endUtc };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

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

    const q = await validateQuery(req, QuerySchema);
    const tzOffsetMinutes = q.tzOffsetMinutes ?? 0;

    // Leak-safe device scope check + forms scope
    const device = await prisma.mobileDevice.findFirst({
      where: { id: auth.deviceId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!device) throw httpError(404, "NOT_FOUND", "Not found.");

    const { startUtc, endUtc } = getTodayBoundsUtc(now, tzOffsetMinutes);

    // Scope by assigned ACTIVE forms of this device (stable in MVP)
    const assigned = await prisma.mobileDeviceForm.findMany({
      where: {
        tenantId: auth.tenantId,
        deviceId: auth.deviceId,
        form: { status: "ACTIVE" },
      },
      select: { formId: true },
      take: 500,
    });

    const formIds = assigned.map((a) => a.formId);

    if (formIds.length === 0) {
      return jsonOk(req, {
        range: q.range,
        scope: "deviceForms",
        leadsToday: 0,
        avgPerHour: 0,
        pendingAttachments: 0,
        todayHourlyBuckets: [],
        lastLeadAt: null,
      });
    }

    const leadsToday = await prisma.lead.count({
      where: {
        tenantId: auth.tenantId,
        formId: { in: formIds },
        capturedAt: { gte: startUtc, lt: endUtc },
      },
    });

    const lastLead = await prisma.lead.findFirst({
      where: {
        tenantId: auth.tenantId,
        formId: { in: formIds },
        capturedAt: { gte: startUtc, lt: endUtc },
      },
      select: { capturedAt: true },
      orderBy: { capturedAt: "desc" },
    });

    const hoursSinceStart = Math.max(1, (now.getTime() - startUtc.getTime()) / 3_600_000);
    const avgPerHour = leadsToday === 0 ? 0 : round1(leadsToday / hoursSinceStart);

    // Optional buckets (simple, stable): fetch timestamps (cap)
    const leadTimes = await prisma.lead.findMany({
      where: {
        tenantId: auth.tenantId,
        formId: { in: formIds },
        capturedAt: { gte: startUtc, lt: endUtc },
      },
      select: { capturedAt: true },
      orderBy: { capturedAt: "asc" },
      take: 5000,
    });

    const byHour = new Map<number, number>();
    for (const t of leadTimes) {
      const local = new Date(t.capturedAt.getTime() - tzOffsetMinutes * 60_000);
      const h = local.getUTCHours();
      byHour.set(h, (byHour.get(h) ?? 0) + 1);
    }
    const todayHourlyBuckets = Array.from(byHour.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([hour, count]) => ({ hour, count }));

    // Pending attachments (MVP): BUSINESS_CARD_IMAGE attachments created today for leads in scope
    const pendingAttachments = await prisma.leadAttachment.count({
      where: {
        tenantId: auth.tenantId,
        type: "BUSINESS_CARD_IMAGE",
        createdAt: { gte: startUtc, lt: endUtc },
        lead: {
          tenantId: auth.tenantId,
          formId: { in: formIds },
          capturedAt: { gte: startUtc, lt: endUtc },
        },
      },
    });

    return jsonOk(req, {
      range: q.range,
      scope: "deviceForms",
      leadsToday,
      avgPerHour,
      pendingAttachments,
      todayHourlyBuckets,
      lastLeadAt: lastLead?.capturedAt ?? null,
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
