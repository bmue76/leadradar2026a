import { z } from "zod";
import { Prisma, FormStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody, validateQuery } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

type ListStatus = "DRAFT" | "ACTIVE" | "ARCHIVED" | "ALL";
type AssignedFilter = "YES" | "NO" | "ALL";
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

    status: z.preprocess(
      (v) => cleanEnum(v),
      z.enum(["DRAFT", "ACTIVE", "ARCHIVED", "ALL"]).default("ALL")
    ),

    assigned: z.preprocess(
      (v) => cleanEnum(v),
      z.enum(["YES", "NO", "ALL"]).default("ALL")
    ),

    sort: z.preprocess(
      (v) => cleanEnum(v),
      z.enum(["updatedAt", "name"]).default("updatedAt")
    ),

    dir: z.preprocess(
      (v) => cleanEnum(v),
      z.enum(["asc", "desc"]).default("desc")
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
    text: "Aktiviere zuerst deine Messe unter Betrieb → Events. Danach kannst du ein Formular zuweisen.",
    primary: { label: "Event aktivieren", href: "/admin/events" },
    recommendedFormId: null as string | null,
  };
}

async function computeReadiness(tenantId: string, activeEvent: { id: string; name: string } | null) {
  if (!activeEvent) return readinessForNoActiveEvent();

  const [anyAssigned, activeAssignedCount, firstActiveAssigned] = await Promise.all([
    prisma.form.findFirst({
      where: { tenantId, assignedEventId: activeEvent.id },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, status: true },
    }),
    prisma.form.count({
      where: { tenantId, assignedEventId: activeEvent.id, status: "ACTIVE" },
    }),
    prisma.form.findFirst({
      where: { tenantId, assignedEventId: activeEvent.id, status: "ACTIVE" },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    }),
  ]);

  if (!anyAssigned) {
    return {
      state: "NO_ASSIGNED_FORM" as const,
      headline: "Noch kein Formular zugewiesen",
      text: `Wähle ein Formular aus und weise es dem aktiven Event „${activeEvent.name}“ zu.`,
      primary: { label: "Formular vorbereiten", href: "/admin/templates?intent=create" },
      recommendedFormId: null as string | null,
    };
  }

  if (activeAssignedCount <= 0 || !firstActiveAssigned) {
    return {
      state: "ASSIGNED_BUT_INACTIVE" as const,
      headline: "Fast bereit",
      text: "Ein Formular ist zugewiesen, aber noch nicht aktiv. Stelle den Status auf „Aktiv“, damit es in der App erscheint.",
      primary: { label: "Formular aktivieren", href: `/admin/forms?open=${anyAssigned.id}` },
      recommendedFormId: anyAssigned.id,
    };
  }

  const recommended = firstActiveAssigned.id;
  return {
    state: (activeAssignedCount > 1 ? "READY_MULTI" : "READY") as ReadinessState,
    headline: "Bereit für die Messe",
    text: `In der App ist ein Formular für „${activeEvent.name}“ sichtbar. Du kannst Leads erfassen.`,
    primary: { label: "Formular bearbeiten", href: `/admin/forms?open=${recommended}` },
    recommendedFormId: recommended,
    activeAssignedCount,
  };
}

export async function GET(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const query = await validateQuery(req, ListFormsQuerySchema);

    // Active event context (Option 2 filter + assignedToActiveEvent)
    const activeEvent = await prisma.event.findFirst({
      where: { tenantId, status: "ACTIVE" },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, name: true },
    });

    const activeEventId = activeEvent?.id ?? null;

    // Readiness is independent of UI filters (consumer-first)
    const readiness = await computeReadiness(tenantId, activeEvent ? { id: activeEvent.id, name: activeEvent.name } : null);

    // Special-case: assigned=YES but no active event => empty list (not an error)
    if (query.assigned === "YES" && !activeEventId) {
      return jsonOk(req, {
        activeEvent: null,
        readiness,
        forms: [],
        items: [],
      });
    }

    const where: Prisma.FormWhereInput = { tenantId };

    const prismaStatus = mapStatusToPrisma(query.status as ListStatus);
    if (prismaStatus) where.status = prismaStatus;

    if (query.q) where.name = { contains: query.q, mode: "insensitive" };

    const assigned = query.assigned as AssignedFilter;

    // assigned filter is relative to ACTIVE event (Option 2)
    if (assigned === "YES" && activeEventId) {
      where.assignedEventId = activeEventId;
    } else if (assigned === "NO" && activeEventId) {
      where.OR = [{ assignedEventId: null }, { assignedEventId: { not: activeEventId } }];
    }

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
        assignedEventId: true,
        _count: { select: { fields: true } },
      },
    });

    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      status: r.status,
      category: null as string | null, // MVP: Form has no category field
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      fieldsCount: r._count.fields,
      assignedEventId: r.assignedEventId ?? null,
      assignedToActiveEvent: activeEventId ? r.assignedEventId === activeEventId : false,
    }));

    // Backward compatible:
    // - forms: historical contract used by existing admin screens
    // - items: alias for generic clients
    return jsonOk(req, {
      activeEvent: activeEvent ? { id: activeEvent.id, name: activeEvent.name } : null,
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
        assignedEventId: null,
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
