import { z } from "zod";
import { Prisma, FormStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const IdSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i);

function isPromiseLike<T>(v: unknown): v is Promise<T> {
  return (
    typeof v === "object" &&
    v !== null &&
    "then" in v &&
    typeof (v as { then?: unknown }).then === "function"
  );
}

async function getParams<T extends Record<string, string>>(ctx: unknown): Promise<T> {
  const params = (ctx as { params?: unknown })?.params;
  if (isPromiseLike<T>(params)) return await params;
  return params as T;
}

function toNullableJsonInput(
  v: unknown | null | undefined
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (v === undefined) return undefined; // don't update
  if (v === null) return Prisma.DbNull; // clear to DB NULL
  return v as Prisma.InputJsonValue;
}

const UpdateFormSchema = z
  .object({
    // backward-compatible fields
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    config: z.unknown().nullable().optional(),

    // TP 5.2 fields
    status: z.nativeEnum(FormStatus).optional(),
    setAssignedToActiveEvent: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "No fields to update." });

async function getActiveEventForTenant(tenantId: string): Promise<{ id: string; name: string } | null> {
  const ev = await prisma.event.findFirst({
    where: { tenantId, status: "ACTIVE" },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true },
  });
  return ev ? { id: ev.id, name: ev.name } : null;
}

export async function GET(req: Request, ctx: unknown) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const { id } = await getParams<{ id: string }>(ctx);

    if (!IdSchema.safeParse(id).success) throw httpError(404, "NOT_FOUND", "Not found.");

    const form = await prisma.form.findFirst({
      where: { id, tenantId },
      include: { fields: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });

    if (!form) throw httpError(404, "NOT_FOUND", "Not found.");
    return jsonOk(req, form);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}

export async function PATCH(req: Request, ctx: unknown) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const { id } = await getParams<{ id: string }>(ctx);

    if (!IdSchema.safeParse(id).success) throw httpError(404, "NOT_FOUND", "Not found.");

    const body = await validateBody(req, UpdateFormSchema);

    const wantsArchive = body.status === FormStatus.ARCHIVED;

    // setAssignedToActiveEvent=true needs:
    // - active event exists
    // - form is not archived (guardrail)
    let assignEventId: string | null | undefined = undefined;

    if (wantsArchive) {
      // MVP guardrail: archived => assignment removed
      assignEventId = null;
    } else if (body.setAssignedToActiveEvent === true) {
      const existing = await prisma.form.findFirst({
        where: { id, tenantId },
        select: { status: true },
      });
      if (!existing) throw httpError(404, "NOT_FOUND", "Not found.");
      if (existing.status === FormStatus.ARCHIVED) {
        throw httpError(400, "BAD_REQUEST", "Archivierte Formulare können nicht dem aktiven Event zugewiesen werden.");
      }

      const activeEvent = await getActiveEventForTenant(tenantId);
      if (!activeEvent) {
        throw httpError(400, "BAD_REQUEST", "Kein aktives Event. Bitte zuerst ein Event aktivieren.");
      }

      assignEventId = activeEvent.id;
    } else if (body.setAssignedToActiveEvent === false) {
      assignEventId = null;
    }

    const res = await prisma.form.updateMany({
      where: { id, tenantId },
      data: {
        name: body.name,
        description: body.description === undefined ? undefined : body.description,
        config: toNullableJsonInput(body.config),

        status: body.status,
        assignedEventId: assignEventId,
      },
    });

    if (res.count === 0) throw httpError(404, "NOT_FOUND", "Not found.");

    const updated = await prisma.form.findFirst({
      where: { id, tenantId },
      include: { fields: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
    });

    if (!updated) throw httpError(404, "NOT_FOUND", "Not found.");
    return jsonOk(req, updated);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
