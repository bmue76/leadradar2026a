import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody, validateQuery, httpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const IsoDateTimeString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "Invalid datetime.");

const LimitSchema = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? 200 : Number.parseInt(v, 10)))
  .refine((n) => Number.isInteger(n) && n >= 1 && n <= 500, "limit must be an integer between 1 and 500.");

const ListQuerySchema = z
  .object({
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
    limit: LimitSchema,
  })
  .transform((q) => ({
    status: q.status,
    limit: q.limit,
  }));

const CreateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    location: z.string().trim().max(180).optional(),
    startsAt: IsoDateTimeString.optional(),
    endsAt: IsoDateTimeString.optional(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.startsAt && b.endsAt) {
      const s = new Date(b.startsAt);
      const e = new Date(b.endsAt);
      if (s.getTime() > e.getTime()) {
        ctx.addIssue({ code: "custom", message: "`startsAt` must be <= `endsAt`." });
      }
    }
  });

export async function GET(req: Request) {
  try {
    const auth = await requireAdminAuth(req);
    const query = await validateQuery(req, ListQuerySchema);

    const items = await prisma.event.findMany({
      where: {
        tenantId: auth.tenantId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
      take: query.limit,
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

    return jsonOk(req, { items });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_SERVER_ERROR", "Unexpected server error.");
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdminAuth(req);
    const body = await validateBody(req, CreateBodySchema, 256 * 1024);

    const startsAt = body.startsAt ? new Date(body.startsAt) : undefined;
    const endsAt = body.endsAt ? new Date(body.endsAt) : undefined;

    if (startsAt && Number.isNaN(startsAt.getTime())) throw httpError(400, "INVALID_BODY", "Invalid request body.");
    if (endsAt && Number.isNaN(endsAt.getTime())) throw httpError(400, "INVALID_BODY", "Invalid request body.");

    const ev = await prisma.event.create({
      data: {
        tenantId: auth.tenantId,
        name: body.name,
        location: body.location?.trim() ? body.location.trim() : undefined,
        startsAt,
        endsAt,
        status: body.status ?? "DRAFT",
      },
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

    return jsonOk(req, { event: ev });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_SERVER_ERROR", "Unexpected server error.");
  }
}
