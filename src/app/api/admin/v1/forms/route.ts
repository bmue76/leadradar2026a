import { z } from "zod";
import { Prisma, FormStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody, validateQuery } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

type ListStatus = "DRAFT" | "ACTIVE" | "ARCHIVED" | "ALL";
type SortKey = "updatedAt" | "name";
type SortDir = "asc" | "desc";

type ReadinessState = "NO_ACTIVE_EVENT" | "NO_ASSIGNED_FORM" | "ASSIGNED_BUT_INACTIVE" | "READY" | "READY_MULTI";

function firstString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return undefined;
}

function cleanEnum(v: unknown): string | undefined {
  const s = firstString(v);
  const t = (s ?? "").trim();
  return t ? t : undefined;
}

const IdSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i);

const ListFormsQuerySchema = z
  .object({
    q: z.preprocess(
      (v) => {
        const s = firstString(v);
        const t = (s ?? "").trim();
        return t ? t : undefined;
      },
      z.string().min(1).max(200).optional()
    ),

    status: z.preprocess((v) => cleanEnum(v), z.enum(["DRAFT", "ACTIVE", "ARCHIVED", "ALL"]).default("ALL")),

    /**
     * DEPRECATED (TP7.10):
     * - Old UI used `assigned` to filter relative to a context event.
     * - New UX removed the assigned filter UI.
     * - We keep this query param for backward compatibility, but IGNORE it.
     */
    assigned: z.preprocess((v) => cleanEnum(v), z.enum(["YES", "NO", "ALL"]).default("ALL")),

    sort: z.preprocess((v) => cleanEnum(v), z.enum(["updatedAt", "name"]).default("updatedAt")),
    dir: z.preprocess((v) => cleanEnum(v), z.enum(["asc", "desc"]).default("desc")),

    // optional context event (for readiness + derived flags)
    eventId: z.preprocess(
      (v) => {
        const s = firstString(v);
        const t = (s ?? "").trim();
        return t ? t : undefined;
      },
      IdSchema.optional()
    ),
  })
  .strict();

const CreateFormSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  status: z.nativeEnum(FormStatus).optional(),
  config: z.unknown().optional(),
});

function prismaMetaTarget(e: Prisma.PrismaClientKnownRequestError): unknown {
  const meta = e.meta;
  if (meta && typeof meta === "object" && "target" in meta) {
    return (meta as { target?: unknown }).target;
  }
  return undefined;
}

function mapPrismaUniqueConflict(
  e: unknown
): { status: number; code: string; message: string; details?: unknown } | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      return {
        status: 409,
        code: "UNIQUE_CONFLICT",
        message: "Unique constraint violation.",
        details: { target: prismaMetaTarget(e) },
      };
    }
  }
  return null;
}

function mapStatusToPrisma(s: ListStatus): FormStatus | undefined {
  if (s === "ALL") return undefined;
  return s as unknown as FormStatus;
}

function readinessForNoActiveEvent() {
  return {
    state: "NO_ACTIVE_EVENT" as const,
    headline: "Kein aktives Event",
    text: "Aktiviere zuerst deine Messe unter Betrieb → Events. Danach kannst du Formulare aktiv schalten und die Sichtbarkeit setzen (Global oder Events).",
    primary: { label: "Event aktivieren", href: "/admin/events" },
    recommendedFormId: null as string | null,
  };
}

type ContextEvent = { id: string; name: string };

function visibilityWhereForEvent(tenantId: string, eventId: string): Prisma.FormWhereInput {
  // Mobile rule (MVP):
  // visible if assigned to event OR global (no assignments at all)
  return {
    tenantId,
    OR: [
      { eventAssignments: { some: { tenantId, eventId } } },
      { eventAssignments: { none: {} } },
    ],
  };
}

async function computeReadiness(tenantId: string, contextEvent: ContextEvent | null) {
  if (!contextEvent) return readinessForNoActiveEvent();

  const visibleWhere = visibilityWhereForEvent(tenantId, contextEvent.id);

  const [anyVisible, activeVisibleCount, firstActiveVisible] = await Promise.all([
    prisma.form.findFirst({
      where: visibleWhere,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, status: true },
    }),
    prisma.form.count({
      where: { ...visibleWhere, status: "ACTIVE" },
    }),
    prisma.form.findFirst({
      where: { ...visibleWhere, status: "ACTIVE" },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    }),
  ]);

  if (!anyVisible) {
    return {
      state: "NO_ASSIGNED_FORM" as const,
      headline: "Noch kein Formular sichtbar",
      text: `Aktuell ist kein Formular global oder für „${contextEvent.name}“ sichtbar. Öffne ein Formular und setze die Sichtbarkeit im Drawer (Global oder Event).`,
      primary: { label: "Formular vorbereiten", href: "/admin/templates?intent=create" },
      recommendedFormId: null as string | null,
    };
  }

  if (activeVisibleCount <= 0 || !firstActiveVisible) {
    return {
      state: "ASSIGNED_BUT_INACTIVE" as const,
      headline: "Fast bereit",
      text: "Ein Formular ist sichtbar konfiguriert, aber noch nicht aktiv. Stelle den Status auf „Aktiv“, damit es in der App erscheint.",
      primary: { label: "Formular aktivieren", href: `/admin/forms?open=${anyVisible.id}` },
      recommendedFormId: anyVisible.id,
    };
  }

  const recommended = firstActiveVisible.id;
  return {
    state: (activeVisibleCount > 1 ? "READY_MULTI" : "READY") as ReadinessState,
    headline: "Bereit für die Messe",
    text: `In der App ist mindestens ein Formular für „${contextEvent.name}“ sichtbar. Du kannst Leads erfassen.`,
    primary: { label: "Formular bearbeiten", href: `/admin/forms?open=${recommended}` },
    recommendedFormId: recommended,
    activeAssignedCount: activeVisibleCount,
  };
}

export async function GET(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const query = await validateQuery(req, ListFormsQuerySchema);

    // Deprecation notice (server-side only). No response shape changes.
    if (process.env.NODE_ENV !== "production" && query.assigned !== "ALL") {
      console.warn(`DEPRECATED query param ignored: assigned=${query.assigned}`);
    }

    const activeEvents = await prisma.event.findMany({
      where: { tenantId, status: "ACTIVE" },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, name: true },
    });

    let contextEvent: ContextEvent | null = null;

    if (query.eventId) {
      const found = activeEvents.find((e) => e.id === query.eventId);
      if (!found) {
        return jsonOk(req, {
          activeEvents,
          contextEvent: null,
          activeEvent: null,
          readiness: readinessForNoActiveEvent(),
          forms: [],
          items: [],
        });
      }
      contextEvent = { id: found.id, name: found.name };
    } else if (activeEvents[0]) {
      contextEvent = { id: activeEvents[0].id, name: activeEvents[0].name };
    }

    const readiness = await computeReadiness(tenantId, contextEvent);

    const where: Prisma.FormWhereInput = { tenantId };

    const prismaStatus = mapStatusToPrisma(query.status as ListStatus);
    if (prismaStatus) where.status = prismaStatus;

    if (query.q) where.name = { contains: query.q, mode: "insensitive" };

    const sort = query.sort as SortKey;
    const dir = query.dir as SortDir;

    const orderBy: Prisma.FormOrderByWithRelationInput[] =
      sort === "name"
        ? [{ name: dir }, { updatedAt: "desc" }, { createdAt: "desc" }]
        : [{ updatedAt: dir }, { createdAt: dir }];

    const rows = await prisma.form.findMany({
      where,
      orderBy,
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { fields: true, eventAssignments: true } },
      },
      take: 500,
    });

    const formIds = rows.map((r) => r.id);

    const singleFormIds = rows.filter((r) => r._count.eventAssignments === 1).map((r) => r.id);

    const singleAssignments = singleFormIds.length
      ? await prisma.eventFormAssignment.findMany({
          where: { tenantId, formId: { in: singleFormIds } },
          select: { formId: true, eventId: true },
          take: singleFormIds.length,
        })
      : [];

    const singleEventIdByFormId = new Map<string, string>();
    for (const a of singleAssignments) singleEventIdByFormId.set(a.formId, a.eventId);

    const assignedToContext = contextEvent?.id
      ? await prisma.eventFormAssignment.findMany({
          where: { tenantId, eventId: contextEvent.id, formId: { in: formIds } },
          select: { formId: true },
          take: 1000,
        })
      : [];

    const assignedToContextSet = new Set<string>(assignedToContext.map((x) => x.formId));

    const items = rows.map((r) => {
      const assignmentCount = r._count.eventAssignments;
      const isGlobal = assignmentCount === 0;
      const assignedToActiveEvent = contextEvent?.id ? isGlobal || assignedToContextSet.has(r.id) : false;

      const derivedSingleEventId = assignmentCount === 1 ? singleEventIdByFormId.get(r.id) ?? null : null;

      return {
        id: r.id,
        name: r.name,
        description: r.description ?? null,
        status: r.status,
        category: null as string | null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        fieldsCount: r._count.fields,

        assignmentCount,
        assignedEventId: derivedSingleEventId,
        assignedToActiveEvent,
      };
    });

    return jsonOk(req, {
      activeEvents,
      contextEvent,
      activeEvent: contextEvent,
      readiness,
      forms: items,
      items,
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    const conflict = mapPrismaUniqueConflict(e);
    if (conflict) return jsonError(req, conflict.status, conflict.code, conflict.message, conflict.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const body = await validateBody(req, CreateFormSchema);

    const created = await prisma.form.create({
      data: {
        tenantId,
        name: body.name,
        description: body.description,
        status: body.status ?? FormStatus.DRAFT,
        config: (body.config ?? undefined) as Prisma.InputJsonValue | undefined,
        assignedEventId: null, // legacy mirror only; source of truth is join table
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        description: true,
        status: true,
        config: true,
        createdAt: true,
        updatedAt: true,
        assignedEventId: true,
      },
    });

    return jsonOk(req, created, { status: 201 });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    const conflict = mapPrismaUniqueConflict(e);
    if (conflict) return jsonError(req, conflict.status, conflict.code, conflict.message, conflict.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
