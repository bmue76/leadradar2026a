import { z } from "zod";
import { Prisma, FormStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

// Next.js 15+: params can be a Promise
type CtxParams = { id?: string } | Promise<{ id?: string }>;
async function readId(ctx: { params: CtxParams }): Promise<string> {
  const p = (await Promise.resolve(ctx.params)) as { id?: string };
  return String(p?.id || "").trim();
}

const PatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    status: z.nativeEnum(FormStatus).optional(),
    config: z.unknown().optional(),

    // Deprecated legacy input:
    // - null => global (no assignments)
    // - string => replace assignments to exactly this eventId
    setAssignedToEventId: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .strict();

export async function GET(req: Request, ctx: { params: CtxParams }) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const id = await readId(ctx);
    if (!id) throw httpError(404, "NOT_FOUND", "Not found.");

    const row = await prisma.form.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        tenantId: true,
        name: true,
        description: true,
        status: true,
        config: true,
        createdAt: true,
        updatedAt: true,
        assignedEventId: true, // legacy mirror (optional)
        fields: { select: { id: true } },
      },
    });

    if (!row) throw httpError(404, "NOT_FOUND", "Not found.");
    return jsonOk(req, row);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function PATCH(req: Request, ctx: { params: CtxParams }) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const id = await readId(ctx);
    if (!id) throw httpError(404, "NOT_FOUND", "Not found.");

    const body = await validateBody(req, PatchSchema);

    const exists = await prisma.form.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!exists) throw httpError(404, "NOT_FOUND", "Not found.");

    const wantsLegacyAssign = Object.prototype.hasOwnProperty.call(body, "setAssignedToEventId");
    const legacyEventId = (body.setAssignedToEventId ?? null) as string | null;

    // IMPORTANT: assignedEventId is not part of FormUpdateInput (checked),
    // but is allowed in FormUncheckedUpdateInput. We keep updates scalar-only.
    const base: Prisma.FormUncheckedUpdateInput = {};

    if (typeof body.name === "string") base.name = body.name;
    if (Object.prototype.hasOwnProperty.call(body, "description")) base.description = body.description ?? null;
    if (body.status) base.status = body.status;
    if (Object.prototype.hasOwnProperty.call(body, "config")) base.config = body.config as Prisma.InputJsonValue;

    if (wantsLegacyAssign) {
      if (legacyEventId === null) {
        const data: Prisma.FormUncheckedUpdateInput = { ...base, assignedEventId: null };

        await prisma.$transaction([
          prisma.eventFormAssignment.deleteMany({ where: { tenantId, formId: id } }),
          prisma.form.update({ where: { id }, data }),
        ]);
      } else {
        // Ensure event exists in tenant (status irrelevant here; UI can show "inaktiv")
        const ev = await prisma.event.findFirst({ where: { id: legacyEventId, tenantId }, select: { id: true } });
        if (!ev) throw httpError(404, "NOT_FOUND", "Not found.");

        const data: Prisma.FormUncheckedUpdateInput = { ...base, assignedEventId: legacyEventId };

        await prisma.$transaction([
          prisma.eventFormAssignment.deleteMany({ where: { tenantId, formId: id } }),
          prisma.eventFormAssignment.create({
            data: { tenantId, formId: id, eventId: legacyEventId },
            select: { formId: true },
          }),
          prisma.form.update({ where: { id }, data }),
        ]);
      }
    } else {
      // Normal patch (does not touch assignments)
      await prisma.form.update({ where: { id }, data: base });
    }

    const out = await prisma.form.findFirst({
      where: { id, tenantId },
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
        fields: { select: { id: true } },
      },
    });

    if (!out) throw httpError(404, "NOT_FOUND", "Not found.");
    return jsonOk(req, out);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
