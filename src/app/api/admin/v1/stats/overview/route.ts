import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateQuery } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";

const QuerySchema = z.object({
  range: z.enum(["7d", "14d", "30d", "90d"]).default("30d"),
  event: z.string().default("ACTIVE"), // "ACTIVE" | "<eventId>"
  tz: z.string().default("Europe/Zurich"),
});

type Status = "NEW" | "REVIEWED";
const DAY_MS = 24 * 60 * 60 * 1000;

function parseRangeDays(range: string): number {
  const n = Number(range.replace("d", ""));
  return Number.isFinite(n) && n > 0 ? n : 30;
}

function dayKey(d: Date, timeZone: string): string {
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

function normLabel(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function extractInterestTokens(values: unknown): string[] {
  // MVP: zählt “Top Interessen” über häufige Feldnamen.
  // Unterstützt String / Array / {label,value}.
  if (!isPlainObject(values)) return [];

  const keyMatch = /(interest|interesse|interessen|thema|themen|topic|topics|branche|branchen|produkt|produkte|service|services)/i;
  const tokens: string[] = [];

  for (const [k, v] of Object.entries(values)) {
    if (!keyMatch.test(k)) continue;

    if (typeof v === "string") {
      const t = normLabel(v);
      if (t) tokens.push(t);
      continue;
    }

    if (Array.isArray(v)) {
      for (const it of v) {
        if (typeof it === "string") {
          const t = normLabel(it);
          if (t) tokens.push(t);
        } else if (isPlainObject(it)) {
          const vv = it["label"] ?? it["value"] ?? it["name"];
          if (typeof vv === "string") {
            const t = normLabel(vv);
            if (t) tokens.push(t);
          }
        }
      }
      continue;
    }

    if (isPlainObject(v)) {
      const vv = v["label"] ?? v["value"] ?? v["name"];
      if (typeof vv === "string") {
        const t = normLabel(vv);
        if (t) tokens.push(t);
      }
    }
  }

  // Guardrail: keine riesigen Texte
  return tokens.filter((t) => t.length > 0 && t.length <= 60);
}

function extractDeviceLabel(meta: unknown): string | null {
  // MVP: device ranking aus meta (kein Schema-Dependency).
  if (!isPlainObject(meta)) return null;

  const candidates = [
    meta["deviceName"],
    meta["device"],
    meta["deviceLabel"],
    meta["deviceId"],
    meta["androidId"],
    meta["iosId"],
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return normLabel(c);
  }

  if (isPlainObject(meta["device"])) {
    const d = meta["device"] as Record<string, unknown>;
    const vv = d["name"] ?? d["label"] ?? d["id"];
    if (typeof vv === "string" && vv.trim()) return normLabel(vv);
  }

  return null;
}

export async function GET(req: Request) {
  try {
    const auth = (await requireAdminAuth(req)) as unknown as { tenantId: string };
    const tenantId = auth.tenantId;

    const { range, event, tz } = await validateQuery(req, QuerySchema);
    const rangeDays = parseRangeDays(range);

    const now = new Date();
    const rangeStartUtc = new Date(now.getTime() - rangeDays * DAY_MS);
    const todayKey = dayKey(now, tz);

    // Events list for dropdown (tenant-scoped)
    const eventsList = await prisma.event.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, name: true, status: true },
    });

    // Resolve selected event (leak-safe)
    let activeEvent: { id: string; name: string } | null = null;
    let selectedEventId: string | null = null;

    if (event === "ACTIVE") {
      const ev = await prisma.event.findFirst({
        where: { tenantId, status: "ACTIVE" },
        select: { id: true, name: true },
      });
      activeEvent = ev ? { id: ev.id, name: ev.name } : null;
      selectedEventId = ev?.id ?? null;
    } else {
      const ev = await prisma.event.findFirst({
        where: { tenantId, id: event },
        select: { id: true, name: true },
      });
      if (!ev) return jsonError(req, 404, "NOT_FOUND", "Event not found.");
      activeEvent = { id: ev.id, name: ev.name };
      selectedEventId = ev.id;
    }

    const whereBase = {
      tenantId,
      isDeleted: false,
      capturedAt: { gte: rangeStartUtc },
      ...(selectedEventId ? { eventId: selectedEventId } : {}),
    } as const;

    // Include values/meta for interests/devices/status
    const leads = await prisma.lead.findMany({
      where: whereBase,
      select: {
        capturedAt: true,
        formId: true,
        eventId: true,
        meta: true,
        values: true,
      },
    });

    // Daily buckets (range)
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

    const leadsToday = byDay.get(todayKey) ?? 0;
    const weekDays = days.slice(Math.max(0, days.length - 7));
    const leadsWeek = weekDays.reduce((sum, d) => sum + (byDay.get(d) ?? 0), 0);
    const leadsTotal = leads.length;

    // Status (MVP: inferred)
    let newCount = 0;
    let reviewedCount = 0;
    for (const l of leads) {
      const s = inferReviewStatusFromMeta(l.meta);
      if (s === "REVIEWED") reviewedCount++;
      else newCount++;
    }

    // OCR (optional)
    const ocrCount = leads.reduce((acc, l) => acc + (hasOcrInMeta(l.meta) ? 1 : 0), 0);
    const ocrRate = leadsTotal > 0 ? ocrCount / leadsTotal : undefined;

    // Hour buckets: today + range total + range avg/day
    const byHourToday = Array.from({ length: 24 }, () => 0);
    const byHourRangeTotal = Array.from({ length: 24 }, () => 0);

    for (const l of leads) {
      const h = hourKey(l.capturedAt, tz);
      byHourRangeTotal[h] = (byHourRangeTotal[h] ?? 0) + 1;
      if (dayKey(l.capturedAt, tz) === todayKey) {
        byHourToday[h] = (byHourToday[h] ?? 0) + 1;
      }
    }

    const leadsByHourToday = byHourToday.map((count, hour) => ({ hour, count }));
    const leadsByHourRange = byHourRangeTotal.map((count, hour) => ({
      hour,
      count,
      avgPerDay: count / Math.max(1, rangeDays),
    }));

    // Top forms (Top 5)
    const formAgg = new Map<string, number>();
    for (const l of leads) formAgg.set(l.formId, (formAgg.get(l.formId) ?? 0) + 1);

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

    // Top interests (Top answers)
    const interestAgg = new Map<string, number>();
    for (const l of leads) {
      const toks = extractInterestTokens(l.values);
      for (const t of toks) interestAgg.set(t, (interestAgg.get(t) ?? 0) + 1);
    }
    const topInterests = [...interestAgg.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));

    // Devices ranking (today/total)
    const devTotal = new Map<string, number>();
    const devToday = new Map<string, number>();

    for (const l of leads) {
      const label = extractDeviceLabel(l.meta) ?? "Unknown device";
      devTotal.set(label, (devTotal.get(label) ?? 0) + 1);
      if (dayKey(l.capturedAt, tz) === todayKey) {
        devToday.set(label, (devToday.get(label) ?? 0) + 1);
      }
    }

    const devicesTotal = [...devTotal.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));

    const devicesToday = [...devToday.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count }));

    return jsonOk(req, {
      range,
      timezone: tz,
      events: eventsList,
      activeEvent,
      selectedEventId,
      kpis: {
        leadsTotal,
        leadsToday,
        leadsWeek,
        reviewedCount,
        newCount,
        ...(ocrCount ? { ocrCount } : {}),
        ...(typeof ocrRate === "number" ? { ocrRate } : {}),
      },
      series: {
        leadsByDay,
        leadsByHourToday,
        leadsByHourRange,
        leadsByStatus: [
          { status: "NEW" as const, count: newCount },
          { status: "REVIEWED" as const, count: reviewedCount },
        ],
      },
      tops: {
        forms: topForms,
        interests: topInterests,
        devicesToday,
        devicesTotal,
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
