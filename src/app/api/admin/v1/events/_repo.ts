// src\app\api\admin\v1\events\_repo.ts
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

/**
 * Shared schemas + mapping for Events API
 */

export const EventStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);

export const EventListQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  status: z.enum(["ALL", "DRAFT", "ACTIVE", "ARCHIVED"]).default("ALL"),
  sort: z.enum(["updatedAt", "startsAt", "name"]).default("updatedAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
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

  // Accept YYYY-MM-DD or ISO; JS Date("YYYY-MM-DD") is UTC midnight.
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
    take: 500,
  });

  return rows.map(mapEventListItem);
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

type CountDelegate = { count: (args: unknown) => Promise<number> };

function getCountDelegate(prisma: unknown, candidates: string[]): CountDelegate | null {
  const rec = prisma as unknown as Record<string, unknown>;
  for (const key of candidates) {
    const maybe = rec[key];
    if (maybe && typeof maybe === "object" && "count" in (maybe as Record<string, unknown>)) {
      const fn = (maybe as Record<string, unknown>)["count"];
      if (typeof fn === "function") return maybe as CountDelegate;
    }
  }
  return null;
}

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

  const deviceDelegate = getCountDelegate(prisma, [
    "mobileDevice", // likely model name
    "device", // fallback if model is Device
  ]);

  const [assignedActiveForms, boundDevices] = await Promise.all([
    prisma.form.count({
      where: { tenantId, status: "ACTIVE", assignedEventId: { in: activeIds } },
    }),
    deviceDelegate
      ? deviceDelegate.count({ where: { tenantId, activeEventId: { in: activeIds } } })
      : Promise.resolve(0),
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

  // (Optional ops-safe) unbind devices pointing to this event
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

/**
 * TP7.4: Delete Event if it was never used (“nicht im Betrieb”).
 * Enforced server-side:
 * - Event must not be ACTIVE
 * - no assigned forms referencing the event
 * - no bound devices (mobileDevice.activeEventId)
 * - no leads referencing the event (best-effort, but fail-safe: unknown schema => block)
 */
export type DeleteEventResult =
  | { status: "DELETED"; id: string }
  | { status: "NOT_FOUND" }
  | {
      status: "NOT_DELETABLE";
      code: "EVENT_NOT_DELETABLE" | "EVENT_DELETE_GUARD_UNKNOWN";
      message: string;
      details?: {
        reasons: string[];
        counts?: { forms: number; devices: number; leads?: number | null };
      };
    };

async function safeCount(delegate: CountDelegate, args: unknown): Promise<number | null> {
  try {
    const n = await delegate.count(args);
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}

async function countLeadsForEvent(prisma: unknown, tenantId: string, eventId: string): Promise<{ known: boolean; count: number | null }> {
  const leadDelegate = getCountDelegate(prisma, [
    "lead",
    "eventLead",
    "capturedLead",
    "mobileLead",
    "leadItem",
    "formSubmission",
  ]);

  if (!leadDelegate) return { known: false, count: null };

  const attempts: unknown[] = [
    { where: { tenantId, eventId } },
    { where: { tenantId, assignedEventId: eventId } },
    { where: { tenantId, event: { id: eventId } } },
  ];

  for (const args of attempts) {
    const n = await safeCount(leadDelegate, args);
    if (n !== null) return { known: true, count: n };
  }

  // Delegate exists but we couldn't count with known field patterns => treat as unknown (fail-safe)
  return { known: false, count: null };
}

export async function deleteEventIfAllowed(prisma: PrismaClient, tenantId: string, id: string): Promise<DeleteEventResult> {
  return await prisma.$transaction(async (tx) => {
    const ev = await tx.event.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });

    if (!ev) return { status: "NOT_FOUND" };

    const reasons: string[] = [];
    if (ev.status === "ACTIVE") reasons.push("EVENT_IS_ACTIVE");

    const [formsCount, devicesCount] = await Promise.all([
      tx.form.count({ where: { tenantId, assignedEventId: id } }),
      tx.mobileDevice.count({ where: { tenantId, activeEventId: id } }),
    ]);

    if (formsCount > 0) reasons.push("HAS_ASSIGNED_FORMS");
    if (devicesCount > 0) reasons.push("HAS_BOUND_DEVICES");

    const leadInfo = await countLeadsForEvent(tx as unknown as PrismaClient, tenantId, id);
    if (!leadInfo.known) {
      // Fail-safe: do not delete if we can't prove lead usage is zero.
      reasons.push("LEAD_GUARD_UNKNOWN");
      return {
        status: "NOT_DELETABLE",
        code: "EVENT_DELETE_GUARD_UNKNOWN",
        message: "Event kann aktuell nicht automatisch gelöscht werden (Lead-Guard unbekannt). Bitte Support kontaktieren.",
        details: { reasons, counts: { forms: formsCount, devices: devicesCount, leads: null } },
      };
    }

    if ((leadInfo.count ?? 0) > 0) reasons.push("HAS_LEADS");

    if (reasons.length > 0) {
      return {
        status: "NOT_DELETABLE",
        code: "EVENT_NOT_DELETABLE",
        message: "Event kann nicht gelöscht werden (bereits genutzt oder noch referenziert).",
        details: { reasons, counts: { forms: formsCount, devices: devicesCount, leads: leadInfo.count } },
      };
    }

    await tx.event.delete({ where: { id } });

    return { status: "DELETED", id };
  });
}
