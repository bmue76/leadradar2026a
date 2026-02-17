// src\app\api\admin\v1\events\_repo.ts
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

/**
 * Shared schemas + mapping for Events API
 */

export const EventStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);

const BoolFromQuery = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return undefined;
}, z.boolean());

const LimitFromQuery = z.preprocess(
  (v) => {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  },
  z.number().int().min(1).max(500)
);

export const EventListQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  status: z.enum(["ALL", "DRAFT", "ACTIVE", "ARCHIVED"]).default("ALL"),
  sort: z.enum(["updatedAt", "startsAt", "name"]).default("updatedAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),

  limit: LimitFromQuery.optional(),
  includeCounts: BoolFromQuery.optional().default(false),
});

export const EventCreateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    startsAt: z.union([z.string().trim().min(1), z.null()]).optional(),
    endsAt: z.union([z.string().trim().min(1), z.null()]).optional(),
    location: z.union([z.string().trim().min(1).max(200), z.null()]).optional(),
  })
  .refine(
    (v) => {
      const s = normalizeDateInput(v.startsAt);
      const e = normalizeDateInput(v.endsAt);
      if (!s || !e) return true;
      return e.getTime() >= s.getTime();
    },
    { message: "endsAt must be >= startsAt" }
  );

export const EventUpdateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    startsAt: z.union([z.string().trim().min(1), z.null()]).optional(),
    endsAt: z.union([z.string().trim().min(1), z.null()]).optional(),
    location: z.union([z.string().trim().min(1).max(200), z.null()]).optional(),
  })
  .refine(
    (v) => {
      const s = normalizeDateInput(v.startsAt);
      const e = normalizeDateInput(v.endsAt);
      if (!s || !e) return true;
      return e.getTime() >= s.getTime();
    },
    { message: "endsAt must be >= startsAt" }
  );

export type EventListQuery = z.infer<typeof EventListQuerySchema>;
export type EventCreateBody = z.infer<typeof EventCreateBodySchema>;
export type EventUpdateBody = z.infer<typeof EventUpdateBodySchema>;

function normalizeDateInput(v: string | null | undefined): Date | null {
  if (v === undefined) return null;
  if (v === null) return null;
  const s = v.trim();
  if (!s) return null;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function dateToIsoDay(d: Date | null): string | undefined {
  if (!d) return undefined;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export type EventListItem = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  startsAt?: string;
  endsAt?: string;
  location?: string;
  updatedAt: string;

  // optional counts
  leadsCount?: number;
  assignedFormsCount?: number;
  boundDevicesCount?: number;

  // convenience for UI
  canDelete?: boolean;
};

export function mapEventListItem(e: {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  startsAt: Date | null;
  endsAt: Date | null;
  location: string | null;
  updatedAt: Date;
}): EventListItem {
  return {
    id: e.id,
    name: e.name,
    status: e.status,
    startsAt: dateToIsoDay(e.startsAt),
    endsAt: dateToIsoDay(e.endsAt),
    location: e.location ?? undefined,
    updatedAt: e.updatedAt.toISOString(),
  };
}

function buildOrderBy(sort: EventListQuery["sort"], dir: EventListQuery["dir"]): Prisma.EventOrderByWithRelationInput[] {
  if (sort === "name") return [{ name: dir }, { updatedAt: "desc" }];
  if (sort === "startsAt") return [{ startsAt: dir }, { updatedAt: "desc" }];
  return [{ updatedAt: dir }, { name: "asc" }];
}

export async function listEvents(prisma: PrismaClient, tenantId: string, q: EventListQuery): Promise<EventListItem[]> {
  const where: Prisma.EventWhereInput = { tenantId };

  if (q.status !== "ALL") where.status = q.status;

  if (q.q) {
    where.OR = [
      { name: { contains: q.q, mode: "insensitive" } },
      { location: { contains: q.q, mode: "insensitive" } },
    ];
  }

  const take = Math.min(q.limit ?? 500, 500);

  const rows = await prisma.event.findMany({
    where,
    orderBy: buildOrderBy(q.sort, q.dir),
    select: {
      id: true,
      name: true,
      status: true,
      startsAt: true,
      endsAt: true,
      location: true,
      updatedAt: true,
    },
    take,
  });

  if (!q.includeCounts || rows.length === 0) {
    return rows.map(mapEventListItem);
  }

  const ids = rows.map((r) => r.id);

  const [leadCounts, formCounts, deviceCounts] = await Promise.all([
    prisma.lead.groupBy({
      by: ["eventId"],
      where: { tenantId, isDeleted: false, eventId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.form.groupBy({
      by: ["assignedEventId"],
      where: { tenantId, assignedEventId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.mobileDevice.groupBy({
      by: ["activeEventId"],
      where: { tenantId, activeEventId: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  const leadsMap = new Map<string, number>();
  for (const r of leadCounts) {
    const key = r.eventId;
    if (typeof key === "string") leadsMap.set(key, r._count._all);
  }

  const formsMap = new Map<string, number>();
  for (const r of formCounts) {
    const key = r.assignedEventId;
    if (typeof key === "string") formsMap.set(key, r._count._all);
  }

  const devicesMap = new Map<string, number>();
  for (const r of deviceCounts) {
    const key = r.activeEventId;
    if (typeof key === "string") devicesMap.set(key, r._count._all);
  }

  return rows.map((row) => {
    const base = mapEventListItem(row);

    const leadsCount = leadsMap.get(row.id) ?? 0;
    const assignedFormsCount = formsMap.get(row.id) ?? 0;
    const boundDevicesCount = devicesMap.get(row.id) ?? 0;

    const canDelete = base.status !== "ACTIVE" && leadsCount === 0 && assignedFormsCount === 0 && boundDevicesCount === 0;

    return {
      ...base,
      leadsCount,
      assignedFormsCount,
      boundDevicesCount,
      canDelete,
    };
  });
}

export async function createEvent(prisma: PrismaClient, tenantId: string, body: EventCreateBody): Promise<EventListItem> {
  const startsAt = normalizeDateInput(body.startsAt) || null;
  const endsAt = normalizeDateInput(body.endsAt) || null;

  const created = await prisma.event.create({
    data: {
      tenantId,
      name: body.name.trim(),
      status: "DRAFT",
      startsAt,
      endsAt,
      location: body.location === null || body.location === undefined ? null : body.location.trim(),
    },
    select: {
      id: true,
      name: true,
      status: true,
      startsAt: true,
      endsAt: true,
      location: true,
      updatedAt: true,
    },
  });

  return mapEventListItem(created);
}

export async function updateEvent(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  patch: EventUpdateBody
): Promise<EventListItem | null> {
  const existing = await prisma.event.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });

  if (!existing) return null;

  const data: Prisma.EventUpdateInput = {};

  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.location !== undefined) data.location = patch.location === null ? null : patch.location.trim();
  if (patch.startsAt !== undefined) data.startsAt = normalizeDateInput(patch.startsAt) || null;
  if (patch.endsAt !== undefined) data.endsAt = normalizeDateInput(patch.endsAt) || null;

  const updated = await prisma.event.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      status: true,
      startsAt: true,
      endsAt: true,
      location: true,
      updatedAt: true,
    },
  });

  return mapEventListItem(updated);
}

/**
 * DELETE helper used by /events/[id]/route.ts
 * - only allowed if NOT ACTIVE and no references:
 *   - no leads (non-deleted) pointing to eventId
 *   - no forms assignedEventId
 *   - no devices activeEventId
 */
export type DeleteEventIfAllowedResult =
  | { ok: true; id: string }
  | {
      ok: false;
      code: "NOT_FOUND" | "NOT_DELETABLE";
      message: string;
      details?: {
        leadsCount: number;
        assignedFormsCount: number;
        boundDevicesCount: number;
        status: "DRAFT" | "ACTIVE" | "ARCHIVED";
      };
    };

export async function deleteEventIfAllowed(prisma: PrismaClient, tenantId: string, id: string): Promise<DeleteEventIfAllowedResult> {
  const ev = await prisma.event.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true },
  });

  if (!ev) {
    return { ok: false, code: "NOT_FOUND", message: "Event nicht gefunden." };
  }

  const [leadsCount, assignedFormsCount, boundDevicesCount] = await Promise.all([
    prisma.lead.count({ where: { tenantId, isDeleted: false, eventId: id } }),
    prisma.form.count({ where: { tenantId, assignedEventId: id } }),
    prisma.mobileDevice.count({ where: { tenantId, activeEventId: id } }),
  ]);

  const details = { leadsCount, assignedFormsCount, boundDevicesCount, status: ev.status };

  if (ev.status === "ACTIVE") {
    return { ok: false, code: "NOT_DELETABLE", message: "Aktive Events können nicht gelöscht werden.", details };
  }

  if (leadsCount > 0 || assignedFormsCount > 0 || boundDevicesCount > 0) {
    return {
      ok: false,
      code: "NOT_DELETABLE",
      message: "Event kann nicht gelöscht werden (bereits genutzt oder noch referenziert).",
      details,
    };
  }

  await prisma.event.delete({ where: { id } });
  return { ok: true, id };
}

export type ActiveOverview = {
  // Backward-compat: "primary" ACTIVE event = most recently updated/created
  activeEvent: null | {
    id: string;
    name: string;
    status: "ACTIVE";
    startsAt?: string;
    endsAt?: string;
    location?: string;
  };

  // New: all ACTIVE events (Multi-ACTIVE)
  activeEvents: Array<{
    id: string;
    name: string;
    status: "ACTIVE";
    startsAt?: string;
    endsAt?: string;
    location?: string;
  }>;

  // Aggregated across ALL ACTIVE events
  counts: {
    assignedActiveForms: number;
    boundDevices: number;
  };

  actions: { href: string; label: string }[];
};

export async function getActiveOverview(prisma: PrismaClient, tenantId: string): Promise<ActiveOverview> {
  const actives = await prisma.event.findMany({
    where: { tenantId, status: "ACTIVE" },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true, status: true, startsAt: true, endsAt: true, location: true },
    take: 50,
  });

  const actions = [
    { href: "/admin/forms", label: "Formulare prüfen" },
    { href: "/admin/devices", label: "Geräte prüfen" },
  ];

  const activeEvents = actives.map((e) => ({
    id: e.id,
    name: e.name,
    status: "ACTIVE" as const,
    startsAt: dateToIsoDay(e.startsAt) ?? undefined,
    endsAt: dateToIsoDay(e.endsAt) ?? undefined,
    location: e.location ?? undefined,
  }));

  const primary = activeEvents[0] ?? null;

  if (activeEvents.length === 0) {
    return {
      activeEvent: null,
      activeEvents: [],
      counts: { assignedActiveForms: 0, boundDevices: 0 },
      actions,
    };
  }

  const activeIds = actives.map((a) => a.id);

  const [assignedActiveForms, boundDevices] = await Promise.all([
    prisma.form.count({
      where: { tenantId, status: "ACTIVE", assignedEventId: { in: activeIds } },
    }),
    prisma.mobileDevice.count({
      where: { tenantId, activeEventId: { in: activeIds } },
    }),
  ]);

  return {
    activeEvent: primary,
    activeEvents,
    counts: { assignedActiveForms, boundDevices },
    actions,
  };
}

export async function activateEvent(
  prisma: PrismaClient,
  tenantId: string,
  id: string
): Promise<"OK" | "NOT_FOUND" | "ARCHIVED"> {
  return await prisma.$transaction(async (tx) => {
    const target = await tx.event.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });

    if (!target) return "NOT_FOUND";
    if (target.status === "ARCHIVED") return "ARCHIVED";
    if (target.status === "ACTIVE") return "OK";

    // Multi-ACTIVE: do NOT deactivate other ACTIVE events.
    await tx.event.update({
      where: { id },
      data: { status: "ACTIVE" },
    });

    return "OK";
  });
}

export async function archiveEvent(
  prisma: PrismaClient,
  tenantId: string,
  id: string
): Promise<"OK" | "NOT_FOUND"> {
  const existing = await prisma.event.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!existing) return "NOT_FOUND";

  // ops-safe: unbind devices pointing to this event
  await prisma.mobileDevice.updateMany({
    where: { tenantId, activeEventId: id },
    data: { activeEventId: null },
  });

  await prisma.event.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });

  return "OK";
}
