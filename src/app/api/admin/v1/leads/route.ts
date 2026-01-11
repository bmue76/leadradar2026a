import { Buffer } from "node:buffer";
import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { validateQuery, isHttpError, httpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Lead has no createdAt/updatedAt in this repo.
 * Stable cursor + sorting: (capturedAt,id).
 * API contract still exposes createdAt/updatedAt as derived = capturedAt (MVP).
 */

function encodeCursor(capturedAt: Date, id: string): string {
  return Buffer.from(`${capturedAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { capturedAt: Date; id: string } {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parts = raw.split("|");
    if (parts.length !== 2) throw new Error("bad_parts");
    const [ts, id] = parts;
    const capturedAt = new Date(ts);
    if (!id || Number.isNaN(capturedAt.getTime())) throw new Error("bad_values");
    return { capturedAt, id };
  } catch {
    throw httpError(400, "INVALID_QUERY", "Invalid cursor.");
  }
}

const IsoDateTimeString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "Invalid datetime.");

const LimitSchema = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? 50 : Number.parseInt(v, 10)))
  .refine((n) => Number.isInteger(n) && n >= 1 && n <= 200, "limit must be an integer between 1 and 200.");

const LeadListQuerySchema = z
  .object({
    formId: z.string().min(1).optional(),
    eventId: z.string().min(1).optional(),
    includeDeleted: z.enum(["true", "false"]).optional(),
    from: IsoDateTimeString.optional(),
    to: IsoDateTimeString.optional(),
    limit: LimitSchema,
    cursor: z.string().min(1).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.from && q.to) {
      const from = new Date(q.from);
      const to = new Date(q.to);
      if (from.getTime() > to.getTime()) {
        ctx.addIssue({ code: "custom", message: "`from` must be <= `to`." });
      }
    }
  })
  .transform((q) => ({
    formId: q.formId,
    eventId: q.eventId,
    includeDeleted: q.includeDeleted === "true",
    from: q.from ? new Date(q.from) : undefined,
    to: q.to ? new Date(q.to) : undefined,
    limit: q.limit,
    cursor: q.cursor,
  }));

export async function GET(req: Request) {
  try {
    const tenant = await requireAdminAuth(req);
    const query = await validateQuery(req, LeadListQuerySchema);

    // leak-safe: if formId provided, ensure it belongs to tenant else 404
    if (query.formId) {
      const form = await prisma.form.findFirst({
        where: { id: query.formId, tenantId: tenant.tenantId },
        select: { id: true },
      });
      if (!form) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    // leak-safe: if eventId provided, ensure it belongs to tenant else 404
    if (query.eventId) {
      const ev = await prisma.event.findFirst({
        where: { id: query.eventId, tenantId: tenant.tenantId },
        select: { id: true },
      });
      if (!ev) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    const cursorParsed = query.cursor ? decodeCursor(query.cursor) : undefined;

    const capturedAtFilter =
      query.from || query.to
        ? {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          }
        : undefined;

    const cursorWhere = cursorParsed
      ? {
          OR: [
            { capturedAt: { lt: cursorParsed.capturedAt } },
            { capturedAt: { equals: cursorParsed.capturedAt }, id: { lt: cursorParsed.id } },
          ],
        }
      : undefined;

    const where = {
      tenantId: tenant.tenantId,
      ...(query.includeDeleted ? {} : { isDeleted: false }),
      ...(query.formId ? { formId: query.formId } : {}),
      ...(query.eventId ? { eventId: query.eventId } : {}),
      ...(capturedAtFilter ? { capturedAt: capturedAtFilter } : {}),
      ...(cursorWhere ? { AND: [cursorWhere] } : {}),
    } as const;

    const rows = await prisma.lead.findMany({
      where,
      orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: {
        id: true,
        formId: true,
        capturedAt: true,
        isDeleted: true,
        values: true,
      },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    // Contract fields: createdAt/updatedAt are derived (=capturedAt) in MVP
    const items = page.map((r) => ({
      ...r,
      createdAt: r.capturedAt,
      updatedAt: r.capturedAt,
    }));

    const nextCursor =
      hasMore && page.length > 0 ? encodeCursor(page[page.length - 1].capturedAt, page[page.length - 1].id) : null;

    return jsonOk(req, { items, nextCursor });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_SERVER_ERROR", "Unexpected server error.");
  }
}
