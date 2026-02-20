import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateQuery } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";

const QuerySchema = z.object({
  range: z.enum(["7d", "14d", "30d", "90d"]).default("30d"),
  event: z.string().default("ACTIVE"), // "ACTIVE" | "ALL" | "<eventId>"
  tz: z.string().default("Europe/Zurich"),
});

type Status = "NEW" | "REVIEWED";

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(d: Date, timeZone: string): string {
  // en-CA => YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function hourKey(d: Date, timeZone: string): number {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(d);
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, Math.min(23, n)) : 0;
}

function parseRangeDays(range: string): number {
  const n = Number(range.replace("d", ""));
  return Number.isFinite(n) && n > 0 ? n : 30;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function inferReviewStatusFromMeta(meta: unknown): Status {
  if (!isPlainObject(meta)) return "NEW";

  const reviewStatus = meta["reviewStatus"];
  if (typeof reviewStatus === "string") {
    const s = reviewStatus.toUpperCase();
    if (s === "REVIEWED") return "REVIEWED";
    if (s === "NEW") return "NEW";
  }

  const reviewed = meta["reviewed"];
  if (typeof reviewed === "boolean") return reviewed ? "REVIEWED" : "NEW";

  const reviewedAt = meta["reviewedAt"];
  if (typeof reviewedAt === "string" && reviewedAt.trim()) return "REVIEWED";

  return "NEW";
}

function hasOcrInMeta(meta: unknown): boolean {
  if (!isPlainObject(meta)) return false;
  const candidates = ["ocr", "ocrText", "cardOcr", "businessCardOcr", "ocrResult"];
  for (const k of candidates) {
    const v = meta[k];
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim()) return true;
    if (typeof v === "boolean") return v;
    if (isPlainObject(v)) return true;
    if (Array.isArray(v) && v.length > 0) return true;
  }
  return false;
}

export async function GET(req: Request) {
  try {
    const auth = (await requireAdminAuth(req)) as unknown as { tenantId: string };
    const tenantId = auth.tenantId;

    const { range, event, tz } = await validateQuery(req, QuerySchema);
    const rangeDays = parseRangeDays(range);

    const now = new Date();
    const rangeStartUtc = new Date(now.getTime() - rangeDays * DAY_MS);

    // Resolve event scope (leak-safe)
    let activeEvent: { id: string; name: string } | null = null;
    let scopedEventId: string | null = null;

    if (event === "ALL") {
      scopedEventId = null;
      activeEvent = null;
    } else if (event === "ACTIVE") {
      const ev = await prisma.event.findFirst({
        where: { tenantId, status: "ACTIVE" },
        select: { id: true, name: true },
      });
      activeEvent = ev ? { id: ev.id, name: ev.name } : null;
      scopedEventId = ev?.id ?? null;
    } else {
      const ev = await prisma.event.findFirst({
        where: { id: event, tenantId },
        select: { id: true, name: true },
      });
      if (!ev) {
        return jsonError(req, 404, "NOT_FOUND", "Event not found.");
      }
      activeEvent = { id: ev.id, name: ev.name };
      scopedEventId = ev.id;
    }

    const whereBase = {
      tenantId,
      isDeleted: false,
      capturedAt: { gte: rangeStartUtc },
      ...(scopedEventId ? { eventId: scopedEventId } : {}),
    } as const;

    const leads = await prisma.lead.findMany({
      where: whereBase,
      select: {
        capturedAt: true,
        formId: true,
        eventId: true,
        meta: true,
      },
    });

    // Days (zero-filled)
    const days: string[] = [];
    for (let i = rangeDays - 1; i >= 0; i--) {
      days.push(dayKey(new Date(now.getTime() - i * DAY_MS), tz));
    }
    const byDay = new Map<string, number>(days.map((d) => [d, 0]));
    for (const l of leads) {
      const k = dayKey(l.capturedAt, tz);
      if (byDay.has(k)) byDay.set(k, (byDay.get(k) ?? 0) + 1);
    }
    const leadsByDay = days.map((d) => ({ day: d, count: byDay.get(d) ?? 0 }));

    const todayKey = dayKey(now, tz);
    const leadsToday = byDay.get(todayKey) ?? 0;

    const weekDays = days.slice(Math.max(0, days.length - 7));
    const leadsWeek = weekDays.reduce((sum, d) => sum + (byDay.get(d) ?? 0), 0);

    // Status (MVP: inferred)
    let newCount = 0;
    let reviewedCount = 0;
    for (const l of leads) {
      const s = inferReviewStatusFromMeta(l.meta);
      if (s === "REVIEWED") reviewedCount++;
      else newCount++;
    }

    const leadsTotal = leads.length;
    const leadsActiveEvent = scopedEventId ? leadsTotal : null;

    // OCR (optional)
    let ocrCount: number | undefined = undefined;
    let ocrRate: number | undefined = undefined;
    const ocr = leads.reduce((acc, l) => acc + (hasOcrInMeta(l.meta) ? 1 : 0), 0);
    if (ocr > 0 || leadsTotal > 0) {
      ocrCount = ocr;
      if (leadsTotal > 0) ocrRate = ocr / leadsTotal;
    }

    // Traffic today: 24h buckets (tz)
    const byHour = Array.from({ length: 24 }, () => 0);
    for (const l of leads) {
      if (dayKey(l.capturedAt, tz) !== todayKey) continue;
      const h = hourKey(l.capturedAt, tz);
      byHour[h] = (byHour[h] ?? 0) + 1;
    }
    const leadsByHourToday = byHour.map((count, hour) => ({ hour, count }));

    // Tops: forms (Top 5)
    const formAgg = new Map<string, number>();
    for (const l of leads) {
      formAgg.set(l.formId, (formAgg.get(l.formId) ?? 0) + 1);
    }
    const topFormIds = [...formAgg.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    const forms = topFormIds.length
      ? await prisma.form.findMany({
          where: { tenantId, id: { in: topFormIds } },
          select: { id: true, name: true },
        })
      : [];
    const formsById = new Map(forms.map((f) => [f.id, f.name]));
    const topForms = topFormIds.map((id) => ({
      id,
      name: formsById.get(id) ?? "Form",
      count: formAgg.get(id) ?? 0,
    }));

    // Tops: events (Top 5)
    const eventAgg = new Map<string, number>();
    for (const l of leads) {
      if (!l.eventId) continue;
      eventAgg.set(l.eventId, (eventAgg.get(l.eventId) ?? 0) + 1);
    }
    const topEventIds = [...eventAgg.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    const events = topEventIds.length
      ? await prisma.event.findMany({
          where: { tenantId, id: { in: topEventIds } },
          select: { id: true, name: true },
        })
      : [];
    const eventsById = new Map(events.map((e) => [e.id, e.name]));
    const topEvents = topEventIds.map((id) => ({
      id,
      name: eventsById.get(id) ?? "Event",
      count: eventAgg.get(id) ?? 0,
    }));

    return jsonOk(req, {
      range,
      timezone: tz,
      activeEvent: event === "ALL" ? null : activeEvent,
      kpis: {
        leadsTotal,
        leadsToday,
        leadsWeek,
        leadsActiveEvent,
        reviewedCount,
        newCount,
        ...(typeof ocrCount === "number" ? { ocrCount } : {}),
        ...(typeof ocrRate === "number" ? { ocrRate } : {}),
      },
      series: {
        leadsByDay,
        leadsByHourToday,
        leadsByStatus: [
          { status: "NEW" as const, count: newCount },
          { status: "REVIEWED" as const, count: reviewedCount },
        ],
      },
      tops: {
        events: topEvents,
        forms: topForms,
      },
    });
  } catch (e) {
    if (isHttpError(e)) {
      return jsonError(req, e.status, e.code, e.message, e.details);
    }
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
