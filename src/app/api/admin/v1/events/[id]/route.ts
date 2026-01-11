import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

const IsoDateTimeString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "Invalid datetime.");

const PatchBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    location: z.string().trim().max(180).optional().nullable(),
    startsAt: IsoDateTimeString.optional().nullable(),
    endsAt: IsoDateTimeString.optional().nullable(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  })
  .refine(
    (v) =>
      typeof v.name === "string" ||
      typeof v.status === "string" ||
      v.location !== undefined ||
      v.startsAt !== undefined ||
      v.endsAt !== undefined,
    { message: "At least one field must be provided." }
  )
  .superRefine((b, ctx) => {
    const s = b.startsAt && typeof b.startsAt === "string" ? new Date(b.startsAt) : null;
    const e = b.endsAt && typeof b.endsAt === "string" ? new Date(b.endsAt) : null;
    if (s && e && s.getTime() > e.getTime()) {
      ctx.addIssue({ code: "custom", message: "`startsAt` must be <= `endsAt`." });
    }
  });

export async function GET(req: Request, ctx: RouteCtx) {
  try {
    const auth = await requireAdminAuth(req);
    const { id } = await ctx.params;

    const ev = await prisma.event.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: {
        id: true,
        name: true,
        location: true,
        startsAt: true,
        endsAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!ev) throw httpError(404, "NOT_FOUND", "Not found.");
    return jsonOk(req, { event: ev });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  try {
    const auth = await requireAdminAuth(req);
    const { id } = await ctx.params;

    const body = await validateBody(req, PatchBodySchema, 256 * 1024);

    const exists = await prisma.event.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: { id: true, status: true },
    });
    if (!exists) throw httpError(404, "NOT_FOUND", "Not found.");

    const startsAt =
      body.startsAt === undefined ? undefined : body.startsAt === null ? null : new Date(body.startsAt);
    const endsAt = body.endsAt === undefined ? undefined : body.endsAt === null ? null : new Date(body.endsAt);

    if (startsAt instanceof Date && Number.isNaN(startsAt.getTime())) throw httpError(400, "INVALID_BODY", "Invalid request body.");
    if (endsAt instanceof Date && Number.isNaN(endsAt.getTime())) throw httpError(400, "INVALID_BODY", "Invalid request body.");

    const updated = await prisma.event.updateMany({
      where: { id, tenantId: auth.tenantId },
      data: {
        ...(typeof body.name === "string" ? { name: body.name } : {}),
        ...(body.location !== undefined ? { location: body.location === null ? null : body.location } : {}),
        ...(body.startsAt !== undefined ? { startsAt } : {}),
        ...(body.endsAt !== undefined ? { endsAt } : {}),
        ...(typeof body.status === "string" ? { status: body.status } : {}),
      },
    });

    if (updated.count === 0) throw httpError(404, "NOT_FOUND", "Not found.");

    // Safety: if event archived -> detach from devices (so mobile won't keep tagging unexpectedly)
    if (body.status === "ARCHIVED") {
      await prisma.mobileDevice.updateMany({
        where: { tenantId: auth.tenantId, activeEventId: id },
        data: { activeEventId: null },
      });
    }

    const ev = await prisma.event.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: {
        id: true,
        name: true,
        location: true,
        startsAt: true,
        endsAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!ev) throw httpError(404, "NOT_FOUND", "Not found.");
    return jsonOk(req, { event: ev });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
