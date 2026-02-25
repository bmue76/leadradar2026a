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

    sort: z.preprocess((v) => cleanEnum(v), z.enum(["updatedAt", "name"]).default("updatedAt")),

    dir: z.preprocess((v) => cleanEnum(v), z.enum(["asc", "desc"]).default("desc")),

    // deprecated (ignored): used by older UI versions
    assigned: z.preprocess((v) => cleanEnum(v), z.enum(["YES", "NO", "ALL"]).default("ALL")).optional(),

    // deprecated for list filtering; still used for readiness context selection
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

function mapStatusToPrisma(s: ListStatus): FormStatus | undefined {
  if (s === "ALL") return undefined;
  return s as unknown as FormStatus;
}

function readinessForNoActiveEvent() {
  return {
    state: "NO_ACTIVE_EVENT" as const,
    headline: "Kein aktives Event",
    text: "Aktiviere zuerst deine Messe unter Betrieb → Events. Danach kannst du Formulare sichtbar schalten (Global oder Events).",
    primary: { label: "Event aktivieren", href: "/admin/events" },
    recommendedFormId: null as string | null,
  };
}

async function computeReadiness(tenantId: string, contextEvent: { id: string; name: string } | null) {
  if (!contextEvent) return readinessForNoActiveEvent();

  const visibleWhere: Prisma.FormWhereInput = {
    tenantId,
    OR: [
      { eventAssignments: { some: { tenantId, eventId: contextEvent.id } } },
      { eventAssignments: { none: {} }, assignedEventId: null }, // global (join empty + legacy null)
      { assignedEventId: contextEvent.id }, // legacy compat
    ],
  };

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
      text: `Setze im Formular-Drawer die Sichtbarkeit (Global oder Event „${contextEvent.name}“).`,
      primary: { label: "Formular vorbereiten", href: "/admin/templates?intent=create" },
      recommendedFormId: null as string | null,
    };
  }

  if (activeVisibleCount <= 0 || !firstActiveVisible) {
    return {
      state: "ASSIGNED_BUT_INACTIVE" as const,
      headline: "Fast bereit",
      text: "Ein Formular ist sichtbar, aber noch nicht aktiv. Stelle den Status auf „Aktiv“, damit es in der App erscheint.",
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

    // Active events list (used by drawer toggles + readiness context)
    const activeEvents = await prisma.event.findMany({
      where: { tenantId, status: "ACTIVE" },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, name: true },
    });

    // Resolve readiness context event:
    // - if eventId is given: must be among activeEvents (leak-safe => treat as none)
    // - else default: most recently updated active event
    let contextEvent = null as null | { id: string; name: string };

    if (query.eventId) {
      const found = activeEvents.find((e) => e.id === query.eventId);
      if (found) contextEvent = { id: found.id, name: found.name };
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
        assignedEventId: true, // legacy mirror only
        _count: { select: { fields: true } },
      },
      take: 500,
    });

    // Join-table counts for the returned forms
    const formIds = rows.map((r) => r.id);
    const assigns = formIds.length
      ? await prisma.eventFormAssignment.findMany({
          where: { tenantId, formId: { in: formIds } },
          select: { formId: true, eventId: true },
          take: 10_000,
        })
      : [];

    const map = new Map<string, string[]>();
    for (const a of assigns) {
      const arr = map.get(a.formId) ?? [];
      arr.push(a.eventId);
      map.set(a.formId, arr);
    }

    const items = rows.map((r) => {
      const evs = map.get(r.id) ?? [];
      const assignmentCount = evs.length;

      // for UI label: if exactly 1 assignment, expose that eventId; else null
      const assignedEventId = assignmentCount === 1 ? evs[0] : null;

      return {
        id: r.id,
        name: r.name,
        description: r.description ?? null,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        fieldsCount: r._count.fields,

        assignmentCount,
        assignedEventId,

        // backward compat fields (still returned but not authoritative):
        legacyAssignedEventId: r.assignedEventId ?? null,
      };
    });

    return jsonOk(req, {
      activeEvents,
      contextEvent,
      activeEvent: contextEvent, // backward compat
      readiness,
      forms: items,
      items,
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
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
        assignedEventId: null, // legacy mirror stays null by default
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
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
