import { prisma } from "@/lib/prisma";

export type CommandCenterState = "NO_ACTIVE_EVENT" | "ACTIVE_NO_DEVICES" | "LIVE";
export type CommandCenterStatus = "LIVE" | "BEREIT" | "KEIN AKTIVES EVENT";

export type CommandCenterPrimaryCta =
  | { label: "Event öffnen"; href: string }
  | { label: "Event erstellen"; href: string }
  | { label: "Gerät verbinden"; href: string };

export type ActivityItem =
  | { kind: "lead"; at: string; title: string; subtitle: string; href: string }
  | { kind: "device"; at: string; title: string; subtitle: string; href: string }
  | { kind: "export"; at: string; title: string; subtitle: string; href: string };

export type CommandCenterData = {
  nowIso: string;
  state: CommandCenterState;
  status: CommandCenterStatus;

  event: null | { id: string; name: string };

  leadsToday: number;
  withCardToday: number;
  exportsToday: number;

  activeDevices: number;
  activeForms: number;

  lastActivityIso: string | null;

  leadsPerHour: number[]; // 0..23 in Europe/Zurich
  activity: ActivityItem[];
};

type Delegate = {
  count: (args: unknown) => Promise<number>;
  findFirst: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<unknown[]>;
};

function isDelegate(v: unknown): v is Delegate {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.count === "function" && typeof r.findFirst === "function" && typeof r.findMany === "function";
}

function findDelegateByKeyword(keyword: string): Delegate | null {
  const p = prisma as unknown as Record<string, unknown>;
  const keys = Object.keys(p).filter((k) => k.toLowerCase().includes(keyword.toLowerCase()));
  for (const k of keys) {
    const v = p[k];
    if (isDelegate(v)) return v;
  }
  return null;
}

function parseGmtOffsetMinutes(label: string): number {
  const m = label.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hh = Number(m[2] || 0);
  const mm = Number(m[3] || 0);
  return sign * (hh * 60 + mm);
}

function getZurichStartOfDayUtc(now: Date): Date {
  const tz = "Europe/Zurich";

  const ymdParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = Number(ymdParts.find((p) => p.type === "year")?.value ?? "1970");
  const month = Number(ymdParts.find((p) => p.type === "month")?.value ?? "01");
  const day = Number(ymdParts.find((p) => p.type === "day")?.value ?? "01");

  const offsetParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  }).formatToParts(now);

  const offsetLabel = offsetParts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+0";
  const offsetMinutes = parseGmtOffsetMinutes(offsetLabel);

  const utcMs = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMinutes * 60_000;
  return new Date(utcMs);
}

function hourInZurich(d: Date): number {
  const tz = "Europe/Zurich";
  const h = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(d);
  const n = Number(h);
  return Number.isFinite(n) ? n : 0;
}

function formatRelativeShort(iso: string, now: Date): string {
  const t = new Date(iso).getTime();
  const diffMs = Math.max(0, now.getTime() - t);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 30) return "gerade eben";
  const min = Math.floor(sec / 60);
  if (min < 60) return `vor ${min} Min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `vor ${hr} Std`;
  const days = Math.floor(hr / 24);
  return `vor ${days} Tg`;
}

function toIsoMaybe(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  return null;
}

async function deviceCountActive(delegate: Delegate, tenantId: string, since: Date): Promise<number> {
  // Try lastSeenAt first, then updatedAt.
  try {
    return await delegate.count({ where: { tenantId, lastSeenAt: { gte: since } } });
  } catch {
    // ignore
  }
  try {
    return await delegate.count({ where: { tenantId, updatedAt: { gte: since } } });
  } catch {
    // ignore
  }
  try {
    return await delegate.count({ where: { tenantId, createdAt: { gte: since } } });
  } catch {
    return 0;
  }
}

type DeviceActivity = { id: string; label: string; atIso: string };

async function deviceRecentToday(delegate: Delegate, tenantId: string, since: Date): Promise<DeviceActivity[]> {
  const attempts: Array<() => Promise<unknown[]>> = [
    () => delegate.findMany({ where: { tenantId, lastSeenAt: { gte: since } }, orderBy: { lastSeenAt: "desc" }, take: 4 }),
    () => delegate.findMany({ where: { tenantId, updatedAt: { gte: since } }, orderBy: { updatedAt: "desc" }, take: 4 }),
    () => delegate.findMany({ where: { tenantId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 4 }),
    () => delegate.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" }, take: 4 }),
  ];

  let rows: unknown[] = [];
  for (const a of attempts) {
    try {
      rows = await a();
      break;
    } catch {
      // try next
    }
  }

  const mapped: DeviceActivity[] = [];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const id = String(r.id ?? "");
    const label =
      typeof r.name === "string"
        ? r.name
        : typeof r.deviceUid === "string"
          ? r.deviceUid
          : typeof r.uid === "string"
            ? r.uid
            : typeof r.code === "string"
              ? r.code
              : id || "Gerät";

    const atIso =
      toIsoMaybe(r.lastSeenAt) ??
      toIsoMaybe(r.updatedAt) ??
      toIsoMaybe(r.createdAt) ??
      new Date().toISOString();

    if (id) mapped.push({ id, label, atIso });
  }

  mapped.sort((a, b) => (a.atIso > b.atIso ? -1 : a.atIso < b.atIso ? 1 : 0));
  return mapped;
}

export async function getCommandCenterData(tenantId: string): Promise<CommandCenterData> {
  const now = new Date();
  const startOfTodayUtc = getZurichStartOfDayUtc(now);

  const activeEvent = await prisma.event.findFirst({
    where: { tenantId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
  });

  const activeWindowMs = 15 * 60_000;
  const activeSince = new Date(now.getTime() - activeWindowMs);

  const deviceDelegate = findDelegateByKeyword("device");

  const [
    activeDevices,
    recentDevices,
    activeForms,
    leadsToday,
    exportsToday,
    lastLead,
    lastExport,
    leadTimes,
    recentLeads,
    recentExports,
    withCardToday,
  ] = await Promise.all([
    deviceDelegate ? deviceCountActive(deviceDelegate, tenantId, activeSince) : Promise.resolve(0),
    deviceDelegate ? deviceRecentToday(deviceDelegate, tenantId, startOfTodayUtc) : Promise.resolve([] as DeviceActivity[]),

    prisma.form.count({ where: { tenantId, status: "ACTIVE" } }),
    prisma.lead.count({ where: { tenantId, isDeleted: false, capturedAt: { gte: startOfTodayUtc, lt: now } } }),
    prisma.exportJob.count({ where: { tenantId, status: "DONE", finishedAt: { gte: startOfTodayUtc, lt: now } } }),

    prisma.lead.findFirst({
      where: { tenantId, isDeleted: false },
      orderBy: { capturedAt: "desc" },
      select: { capturedAt: true },
    }),
    prisma.exportJob.findFirst({
      where: { tenantId, status: "DONE" },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true, updatedAt: true },
    }),

    prisma.lead.findMany({
      where: { tenantId, isDeleted: false, capturedAt: { gte: startOfTodayUtc, lt: now } },
      select: { capturedAt: true },
      orderBy: { capturedAt: "desc" },
      take: 800,
    }),

    prisma.lead.findMany({
      where: { tenantId, isDeleted: false, capturedAt: { gte: startOfTodayUtc, lt: now } },
      select: { id: true, capturedAt: true },
      orderBy: { capturedAt: "desc" },
      take: 6,
    }),

    prisma.exportJob.findMany({
      where: { tenantId, status: "DONE", finishedAt: { gte: startOfTodayUtc, lt: now } },
      select: { id: true, status: true, finishedAt: true, updatedAt: true },
      orderBy: { finishedAt: "desc" },
      take: 4,
    }),

    prisma.leadAttachment.count({
      where: { tenantId, type: "IMAGE", createdAt: { gte: startOfTodayUtc, lt: now } },
    }),
  ]);

  const leadsPerHour = Array.from({ length: 24 }, () => 0);
  for (const row of leadTimes) {
    const h = hourInZurich(new Date(row.capturedAt));
    leadsPerHour[h] = (leadsPerHour[h] ?? 0) + 1;
  }

  const lastDeviceIso = recentDevices.length ? recentDevices[0].atIso : null;

  const lastCandidates = [
    lastDeviceIso,
    lastLead?.capturedAt ? new Date(lastLead.capturedAt).toISOString() : null,
    lastExport?.finishedAt ? new Date(lastExport.finishedAt).toISOString() : lastExport?.updatedAt ? new Date(lastExport.updatedAt).toISOString() : null,
  ].filter(Boolean) as string[];

  const lastActivityIso = lastCandidates.length ? lastCandidates.sort().slice(-1)[0] : null;

  const state: CommandCenterState = !activeEvent ? "NO_ACTIVE_EVENT" : activeDevices === 0 ? "ACTIVE_NO_DEVICES" : "LIVE";
  const status: CommandCenterStatus = !activeEvent ? "KEIN AKTIVES EVENT" : activeDevices === 0 ? "BEREIT" : "LIVE";

  const activity: ActivityItem[] = [];

  for (const l of recentLeads) {
    const iso = new Date(l.capturedAt).toISOString();
    activity.push({
      kind: "lead",
      at: iso,
      title: "Lead erfasst",
      subtitle: formatRelativeShort(iso, now),
      href: `/admin/leads/${l.id}`,
    });
  }

  for (const d of recentDevices) {
    activity.push({
      kind: "device",
      at: d.atIso,
      title: "Gerät aktiv",
      subtitle: `${d.label} · ${formatRelativeShort(d.atIso, now)}`,
      href: `/admin/devices/${d.id}`,
    });
  }

  for (const e of recentExports) {
    const t = e.finishedAt ?? e.updatedAt;
    const iso = new Date(t).toISOString();
    activity.push({
      kind: "export",
      at: iso,
      title: "Export abgeschlossen",
      subtitle: formatRelativeShort(iso, now),
      href: `/admin/exports/${e.id}`,
    });
  }

  activity.sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0));

  return {
    nowIso: now.toISOString(),
    state,
    status,
    event: activeEvent ? { id: activeEvent.id, name: activeEvent.name } : null,

    leadsToday,
    withCardToday,
    exportsToday,

    activeDevices,
    activeForms,

    lastActivityIso,

    leadsPerHour,
    activity: activity.slice(0, 10),
  };
}
