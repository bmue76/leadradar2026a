import { z } from "zod";
import { Prisma, AttachmentType, ExportJobStatus, FormStatus, MobileDeviceStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateQuery } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const EmptyQuerySchema = z.object({}).strict();

type ReadinessLevel = "OK" | "WARN" | "BLOCK";

type ReadinessItemId =
  | "ACTIVE_EVENT_PRESENT"
  | "ACTIVE_FORMS_ASSIGNED_TO_ACTIVE_EVENT"
  | "AT_LEAST_ONE_DEVICE_CONNECTED"
  | "LICENSE_VALID";

type ActivityType =
  | "LEAD_CREATED"
  | "EXPORT_CREATED"
  | "DEVICE_CONNECTED"
  | "EVENT_ACTIVATED"
  | "FORM_ASSIGNED";

function pickGivenName(user: { firstName?: string | null; name?: string | null }): string | null {
  const direct = (user.firstName ?? "").trim();
  if (direct) return direct;

  const n = (user.name ?? "").trim();
  if (!n) return null;

  const first = n.split(/\s+/).filter(Boolean)[0] ?? "";
  return first.trim() || null;
}

function levelRank(l: ReadinessLevel): number {
  if (l === "BLOCK") return 3;
  if (l === "WARN") return 2;
  return 1;
}

function worstLevel(levels: ReadinessLevel[]): ReadinessLevel {
  let worst: ReadinessLevel = "OK";
  for (const l of levels) {
    if (levelRank(l) > levelRank(worst)) worst = l;
  }
  return worst;
}

const TZ = "Europe/Zurich";

function datePartsInTz(d: Date, timeZone: string): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

function timeZoneOffsetMinutes(at: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = fmt.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";

  const asUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")),
    Number(get("minute")),
    Number(get("second"))
  );

  // offset minutes where: local = UTC + offset
  return Math.round((asUtc - at.getTime()) / 60000);
}

function zonedMidnightUtc(ymd: { year: number; month: number; day: number }, timeZone: string): Date {
  const approxUtc = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 0, 0, 0));
  const offMin = timeZoneOffsetMinutes(approxUtc, timeZone);
  return new Date(approxUtc.getTime() - offMin * 60000);
}

function addDaysYmd(
  ymd: { year: number; month: number; day: number },
  deltaDays: number
): { year: number; month: number; day: number } {
  const base = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 0, 0, 0));
  const next = new Date(base.getTime() + deltaDays * 86400000);
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function startOfWeekMondayYmd(ymd: { year: number; month: number; day: number }): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 0, 0, 0));
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const offsetToMonday = (dow + 6) % 7; // Monday=0
  return addDaysYmd(ymd, -offsetToMonday);
}

function exportStatusTitle(s: ExportJobStatus): string {
  if (s === ExportJobStatus.DONE) return "Export abgeschlossen";
  if (s === ExportJobStatus.FAILED) return "Export fehlgeschlagen";
  if (s === ExportJobStatus.RUNNING) return "Export läuft";
  return "Export erstellt";
}

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

export async function GET(req: Request) {
  try {
    const { tenantId, user } = await requireAdminAuth(req);
    await validateQuery(req, EmptyQuerySchema);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        accentColor: true,
        logoKey: true,
      },
    });

    if (!tenant) {
      // leak-safe: tenant missing is treated as NOT_FOUND
      return jsonError(req, 404, "NOT_FOUND", "Nicht gefunden.");
    }

    // Multi-ACTIVE: load all ACTIVE events (primary = most recently updated/created)
    const activeEventRows = await prisma.event.findMany({
      where: { tenantId, status: "ACTIVE" },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        status: true,
        startsAt: true,
        endsAt: true,
        updatedAt: true,
      },
      take: 50,
    });

    const activeEvents = activeEventRows.map((e) => ({
      id: e.id,
      name: e.name,
      status: "ACTIVE" as const,
      startsAt: isoOrNull(e.startsAt),
      endsAt: isoOrNull(e.endsAt),
    }));

    const primaryActiveEvent = activeEventRows[0] ?? null;
    const activeEventIds = activeEventRows.map((e) => e.id);

    const now = new Date();
    const todayYmd = datePartsInTz(now, TZ);
    const tomorrowYmd = addDaysYmd(todayYmd, 1);

    const todayStartUtc = zonedMidnightUtc(todayYmd, TZ);
    const tomorrowStartUtc = zonedMidnightUtc(tomorrowYmd, TZ);

    const weekStartYmd = startOfWeekMondayYmd(todayYmd);
    const nextWeekStartYmd = addDaysYmd(weekStartYmd, 7);
    const weekStartUtc = zonedMidnightUtc(weekStartYmd, TZ);
    const nextWeekStartUtc = zonedMidnightUtc(nextWeekStartYmd, TZ);

    const countActiveAssignedForms =
      activeEventIds.length > 0
        ? await prisma.form.count({
            where: {
              tenantId,
              status: FormStatus.ACTIVE,
              assignedEventId: { in: activeEventIds },
            },
          })
        : 0;

    const deviceConnectedSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const connectedDevicesCount = await prisma.mobileDevice.count({
      where: {
        tenantId,
        status: MobileDeviceStatus.ACTIVE,
        lastSeenAt: { gte: deviceConnectedSince },
      },
    });

    const readinessItems: Array<{
      id: ReadinessItemId;
      level: ReadinessLevel;
      title: string;
      detail: string;
      action?: { label: string; href: string };
    }> = [];

    // 1) Active event present
    if (activeEventIds.length === 0) {
      readinessItems.push({
        id: "ACTIVE_EVENT_PRESENT",
        level: "BLOCK",
        title: "Aktive Events",
        detail: "Keine aktiven Events. Bitte ein Event erstellen oder aktivieren.",
        action: { label: "Events öffnen", href: "/admin/events" },
      });
    } else if (activeEventIds.length === 1) {
      readinessItems.push({
        id: "ACTIVE_EVENT_PRESENT",
        level: "OK",
        title: "Aktives Event",
        detail: `„${primaryActiveEvent?.name ?? "Event"}“ ist aktiv.`,
        action: { label: "Events öffnen", href: "/admin/events" },
      });
    } else {
      readinessItems.push({
        id: "ACTIVE_EVENT_PRESENT",
        level: "OK",
        title: "Aktive Events",
        detail: `${activeEventIds.length} Events sind aktiv (primär: „${primaryActiveEvent?.name ?? "Event"}“).`,
        action: { label: "Events öffnen", href: "/admin/events" },
      });
    }

    // 2) Active forms assigned to active events (Option 2)
    if (activeEventIds.length === 0) {
      readinessItems.push({
        id: "ACTIVE_FORMS_ASSIGNED_TO_ACTIVE_EVENT",
        level: "BLOCK",
        title: "Formulare dem Event zuweisen",
        detail: "Ohne aktive Events können keine Formulare zugewiesen werden.",
        action: { label: "Zu den Formularen", href: "/admin/forms" },
      });
    } else if (countActiveAssignedForms <= 0) {
      readinessItems.push({
        id: "ACTIVE_FORMS_ASSIGNED_TO_ACTIVE_EVENT",
        level: "BLOCK",
        title: "Formulare dem Event zuweisen",
        detail: "Keine ACTIVE Formulare sind einem aktiven Event zugewiesen (Option 2).",
        action: { label: "Zu den Formularen", href: "/admin/forms" },
      });
    } else {
      readinessItems.push({
        id: "ACTIVE_FORMS_ASSIGNED_TO_ACTIVE_EVENT",
        level: "OK",
        title: "Formulare dem Event zugewiesen",
        detail: `${countActiveAssignedForms} ACTIVE Formular(e) sind aktiven Events zugewiesen.`,
        action: { label: "Zu den Formularen", href: "/admin/forms" },
      });
    }

    // 3) At least one device connected (MVP: WARN)
    if (connectedDevicesCount <= 0) {
      readinessItems.push({
        id: "AT_LEAST_ONE_DEVICE_CONNECTED",
        level: "WARN",
        title: "Geräte verbunden",
        detail: "Kein Gerät wurde in den letzten 24h gesehen. Falls ihr live seid: Gerät verbinden oder App öffnen.",
        action: { label: "Geräte öffnen", href: "/admin/devices" },
      });
    } else {
      readinessItems.push({
        id: "AT_LEAST_ONE_DEVICE_CONNECTED",
        level: "OK",
        title: "Geräte verbunden",
        detail: `${connectedDevicesCount} Gerät(e) in den letzten 24h aktiv.`,
        action: { label: "Geräte öffnen", href: "/admin/devices" },
      });
    }

    const readinessOverall = worstLevel(readinessItems.map((i) => i.level));

    // KPIs: tenant-scoped; if active events exist, count only leads on ACTIVE forms assigned to those events (Option 2)
    const leadWhereToday: Prisma.LeadWhereInput = {
      tenantId,
      isDeleted: false,
      capturedAt: { gte: todayStartUtc, lt: tomorrowStartUtc },
    };
    const leadWhereWeek: Prisma.LeadWhereInput = {
      tenantId,
      isDeleted: false,
      capturedAt: { gte: weekStartUtc, lt: nextWeekStartUtc },
    };

    if (activeEventIds.length > 0) {
      leadWhereToday.form = { assignedEventId: { in: activeEventIds }, status: FormStatus.ACTIVE };
      leadWhereWeek.form = { assignedEventId: { in: activeEventIds }, status: FormStatus.ACTIVE };
    }

    const [leadsToday, leadsWeek] = await Promise.all([
      prisma.lead.count({ where: leadWhereToday }),
      prisma.lead.count({ where: leadWhereWeek }),
    ]);

    // Business cards: if attachments exist -> count BUSINESS_CARD_IMAGE today (same Option-2 filter)
    const attachmentWhereToday: Prisma.LeadAttachmentWhereInput = {
      tenantId,
      type: AttachmentType.BUSINESS_CARD_IMAGE,
      createdAt: { gte: todayStartUtc, lt: tomorrowStartUtc },
    };
    if (activeEventIds.length > 0) {
      attachmentWhereToday.lead = { form: { assignedEventId: { in: activeEventIds }, status: FormStatus.ACTIVE } };
    }

    const businessCardsToday = await prisma.leadAttachment.count({ where: attachmentWhereToday });

    // Exports created today
    const exportsToday = await prisma.exportJob.count({
      where: { tenantId, queuedAt: { gte: todayStartUtc, lt: tomorrowStartUtc } },
    });

    // Recent activity (minimal)
    const leadActivityWhere: Prisma.LeadWhereInput = { tenantId, isDeleted: false };
    if (activeEventIds.length > 0) {
      leadActivityWhere.form = { assignedEventId: { in: activeEventIds }, status: FormStatus.ACTIVE };
    }

    const [recentLeads, recentExports, recentDevices] = await Promise.all([
      prisma.lead.findMany({
        where: leadActivityWhere,
        orderBy: [{ capturedAt: "desc" }],
        take: 10,
        select: {
          id: true,
          capturedAt: true,
          form: { select: { id: true, name: true } },
        },
      }),
      prisma.exportJob.findMany({
        where: { tenantId },
        orderBy: [{ queuedAt: "desc" }],
        take: 5,
        select: { id: true, queuedAt: true, status: true },
      }),
      prisma.mobileDevice.findMany({
        where: { tenantId, status: MobileDeviceStatus.ACTIVE, lastSeenAt: { not: null } },
        orderBy: [{ lastSeenAt: "desc" }],
        take: 5,
        select: { id: true, name: true, lastSeenAt: true },
      }),
    ]);

    const activity: Array<{ id: string; type: ActivityType; at: string; title: string; href?: string }> = [];

    for (const l of recentLeads) {
      activity.push({
        id: `lead_${l.id}`,
        type: "LEAD_CREATED",
        at: l.capturedAt.toISOString(),
        title: `Lead erfasst • ${l.form?.name ?? "Formular"}`,
        href: `/admin/leads/${l.id}`,
      });
    }

    for (const e of recentExports) {
      activity.push({
        id: `export_${e.id}`,
        type: "EXPORT_CREATED",
        at: e.queuedAt.toISOString(),
        title: exportStatusTitle(e.status),
        href: "/admin/exports",
      });
    }

    for (const d of recentDevices) {
      activity.push({
        id: `device_${d.id}`,
        type: "DEVICE_CONNECTED",
        at: (d.lastSeenAt ?? new Date()).toISOString(),
        title: `Gerät aktiv • ${d.name}`,
        href: "/admin/devices",
      });
    }

    activity.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

    const quickActions: Array<{
      id: "GO_TO_ACTIVE_EVENT" | "CREATE_OR_ACTIVATE_EVENT" | "CREATE_FORM" | "CONNECT_DEVICE" | "EXPORT_LEADS";
      label: string;
      href: string;
      kind: "primary" | "secondary";
      disabled?: boolean;
    }> = [];

    if (activeEventIds.length > 0) {
      quickActions.push({
        id: "GO_TO_ACTIVE_EVENT",
        label: "Zu aktiven Events",
        href: "/admin/events",
        kind: "primary",
      });
    } else {
      quickActions.push({
        id: "CREATE_OR_ACTIVATE_EVENT",
        label: "Event erstellen/aktivieren",
        href: "/admin/events",
        kind: "primary",
      });
    }

    quickActions.push(
      {
        id: "CREATE_FORM",
        label: "Formulare öffnen",
        href: "/admin/forms",
        kind: "secondary",
      },
      {
        id: "CONNECT_DEVICE",
        label: "Gerät verbinden",
        href: "/admin/devices",
        kind: "secondary",
      },
      {
        id: "EXPORT_LEADS",
        label: "Leads exportieren",
        href: "/admin/exports",
        kind: "secondary",
      }
    );

    const data = {
      me: { givenName: pickGivenName(user) },

      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        displayName: tenant.name,
        logoUrl: tenant.logoKey ? "/api/admin/v1/tenants/current/logo" : null,
        accentColor: tenant.accentColor ?? null,
      },

      // Backward compat: "primary" ACTIVE event
      activeEvent: primaryActiveEvent
        ? {
            id: primaryActiveEvent.id,
            name: primaryActiveEvent.name,
            status: "ACTIVE" as const,
            startsAt: primaryActiveEvent.startsAt ? primaryActiveEvent.startsAt.toISOString() : null,
            endsAt: primaryActiveEvent.endsAt ? primaryActiveEvent.endsAt.toISOString() : null,
          }
        : null,

      // New: all ACTIVE events
      activeEvents,

      readiness: {
        overall: readinessOverall,
        items: readinessItems,
      },

      quickActions,

      kpisToday: {
        leadsCaptured: leadsToday,
        businessCardsCaptured: businessCardsToday,
        exportsCreated: exportsToday,
      },

      kpisThisWeek: { leadsCaptured: leadsWeek },

      recentActivity: activity.slice(0, 12),
    };

    return jsonOk(req, data);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
