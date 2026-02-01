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

export async function updateEvent(prisma: PrismaClient, tenantId: string, id: string, patch: EventUpdateBody): Promise<EventListItem | null> {
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
  activeEvent: null | {
    id: string;
    name: string;
    status: "ACTIVE";
    startsAt?: string;
    endsAt?: string;
    location?: string;
  };
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
  const active = await prisma.event.findFirst({
    where: { tenantId, status: "ACTIVE" },
    select: { id: true, name: true, status: true, startsAt: true, endsAt: true, location: true },
  });

  const actions = [
    { href: "/admin/forms", label: "Formulare prüfen" },
    { href: "/admin/devices", label: "Geräte prüfen" },
  ];

  if (!active) {
    return {
      activeEvent: null,
      counts: { assignedActiveForms: 0, boundDevices: 0 },
      actions,
    };
  }

  const deviceDelegate = getCountDelegate(prisma, [
    "mobileDevice", // likely model name
    "device", // fallback if model is Device
  ]);

  const [assignedActiveForms, boundDevices] = await Promise.all([
    prisma.form.count({
      where: { tenantId, status: "ACTIVE", assignedEventId: active.id },
    }),
    deviceDelegate
      ? deviceDelegate.count({ where: { tenantId, activeEventId: active.id } })
      : Promise.resolve(0),
  ]);

  return {
    activeEvent: {
      id: active.id,
      name: active.name,
      status: "ACTIVE",
      startsAt: dateToIsoDay(active.startsAt) ?? undefined,
      endsAt: dateToIsoDay(active.endsAt) ?? undefined,
      location: active.location ?? undefined,
    },
    counts: { assignedActiveForms, boundDevices },
    actions,
  };
}

export async function activateEvent(prisma: PrismaClient, tenantId: string, id: string): Promise<"OK" | "NOT_FOUND" | "ARCHIVED"> {
  return await prisma.$transaction(async (tx) => {
    const target = await tx.event.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });

    if (!target) return "NOT_FOUND";
    if (target.status === "ARCHIVED") return "ARCHIVED";
    if (target.status === "ACTIVE") return "OK";

    // Ensure unique guardrail: deactivate any currently ACTIVE event first.
    await tx.event.updateMany({
      where: { tenantId, status: "ACTIVE", id: { not: id } },
      data: { status: "DRAFT" },
    });

    await tx.event.update({
      where: { id },
      data: { status: "ACTIVE" },
    });

    return "OK";
  });
}

export async function archiveEvent(prisma: PrismaClient, tenantId: string, id: string): Promise<"OK" | "NOT_FOUND"> {
  const existing = await prisma.event.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!existing) return "NOT_FOUND";

  await prisma.event.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });

  return "OK";
}
