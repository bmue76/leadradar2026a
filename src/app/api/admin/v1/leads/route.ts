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
 *
 * TP 5.7 (MVP): "reviewed" stored in Lead.meta.reviewedAt (ISO string) to avoid migrations.
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function readTrimmedString(v: unknown, maxLen = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, maxLen);
}

function readIsoDateString(v: unknown): string | null {
  const s = readTrimmedString(v, 80);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function extractReviewedAt(meta: unknown): string | null {
  if (!isRecord(meta)) return null;
  return readIsoDateString(meta.reviewedAt);
}

function extractSourceDeviceName(meta: unknown): string | null {
  if (!isRecord(meta)) return null;

  const direct =
    readTrimmedString(meta.sourceDeviceName) ??
    readTrimmedString(meta.deviceName) ??
    readTrimmedString(meta.device) ??
    null;

  if (direct) return direct;

  const deviceObj = meta.device;
  if (isRecord(deviceObj)) {
    return readTrimmedString(deviceObj.name) ?? readTrimmedString(deviceObj.deviceName) ?? null;
  }

  return null;
}

function contactName(first: string | null, last: string | null): string | null {
  const a = (first ?? "").trim();
  const b = (last ?? "").trim();
  const s = `${a} ${b}`.trim();
  return s ? s : null;
}

function pickPhone(phone: string | null, mobile: string | null): string | null {
  const m = (mobile ?? "").trim();
  if (m) return m;
  const p = (phone ?? "").trim();
  return p ? p : null;
}

const IsoDateTimeString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "Invalid datetime.");

const TakeSchema = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : Number.parseInt(v, 10)))
  .refine((n) => n === undefined || (Number.isInteger(n) && n >= 1 && n <= 200), "take must be 1..200.");

const LimitSchema = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : Number.parseInt(v, 10)))
  .refine((n) => n === undefined || (Number.isInteger(n) && n >= 1 && n <= 200), "limit must be 1..200.");

const LeadListQuerySchema = z
  .object({
    // New contract (TP 5.7)
    q: z
      .string()
      .optional()
      .transform((v) => (typeof v === "string" ? v.trim() : ""))
      .transform((v) => (v ? v.slice(0, 120) : "")),
    status: z.enum(["ALL", "NEW", "REVIEWED"]).optional().default("ALL"),
    event: z.enum(["ACTIVE", "ALL"]).optional().default("ACTIVE"),
    sort: z.enum(["createdAt", "updatedAt", "name"]).optional().default("createdAt"),
    dir: z.enum(["asc", "desc"]).optional().default("desc"),
    take: TakeSchema,

    // Backward compat (existing)
    formId: z.string().min(1).optional(),
    eventId: z.string().min(1).optional(),
    includeDeleted: z.enum(["true", "false"]).optional(),
    from: IsoDateTimeString.optional(),
    to: IsoDateTimeString.optional(),
    limit: LimitSchema,
    cursor: z.string().min(1).optional(),
    includeValues: z.enum(["true", "false"]).optional(),
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
  .transform((q) => {
    const effectiveTake = q.take ?? q.limit ?? 50;
    return {
      q: q.q ?? "",
      status: q.status,
      event: q.event,
      sort: q.sort,
      dir: q.dir,
      take: effectiveTake,
      cursor: q.cursor,

      // compat
      formId: q.formId,
      eventId: q.eventId,
      includeDeleted: q.includeDeleted === "true",
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      includeValues: q.includeValues === "true",
    };
  });

async function resolveActiveEventId(tenantId: string): Promise<string | null> {
  const ev = await prisma.event.findFirst({
    where: { tenantId, status: "ACTIVE" },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  return ev?.id ?? null;
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdminAuth(req);
    const query = await validateQuery(req, LeadListQuerySchema);

    // leak-safe: if formId provided, ensure it belongs to tenant else 404
    if (query.formId) {
      const form = await prisma.form.findFirst({
        where: { id: query.formId, tenantId: auth.tenantId },
        select: { id: true },
      });
      if (!form) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    // leak-safe: if eventId provided, ensure it belongs to tenant else 404
    if (query.eventId) {
      const ev = await prisma.event.findFirst({
        where: { id: query.eventId, tenantId: auth.tenantId },
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

    const activeEventId =
      !query.eventId && query.event === "ACTIVE" ? await resolveActiveEventId(auth.tenantId) : null;

    // If event=ACTIVE requested but no active event exists: return empty list (GoLive: predictable).
    if (!query.eventId && query.event === "ACTIVE" && !activeEventId) {
      return jsonOk(req, { items: [], nextCursor: null });
    }

    const cursorWhere =
      cursorParsed && (query.sort === "createdAt" || query.sort === "updatedAt")
        ? query.dir === "asc"
          ? {
              OR: [
                { capturedAt: { gt: cursorParsed.capturedAt } },
                { capturedAt: { equals: cursorParsed.capturedAt }, id: { gt: cursorParsed.id } },
              ],
            }
          : {
              OR: [
                { capturedAt: { lt: cursorParsed.capturedAt } },
                { capturedAt: { equals: cursorParsed.capturedAt }, id: { lt: cursorParsed.id } },
              ],
            }
        : undefined;

    const q = query.q.trim();
    const qWhere =
      q.length >= 2
        ? {
            OR: [
              { contactFirstName: { contains: q, mode: "insensitive" as const } },
              { contactLastName: { contains: q, mode: "insensitive" as const } },
              { contactCompany: { contains: q, mode: "insensitive" as const } },
              { contactEmail: { contains: q, mode: "insensitive" as const } },
              { contactPhone: { contains: q, mode: "insensitive" as const } },
              { contactMobile: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : undefined;

    const where = {
      tenantId: auth.tenantId,
      ...(query.includeDeleted ? {} : { isDeleted: false }),
      ...(query.formId ? { formId: query.formId } : {}),
      ...(query.eventId ? { eventId: query.eventId } : {}),
      ...(!query.eventId && activeEventId ? { eventId: activeEventId } : {}),
      ...(capturedAtFilter ? { capturedAt: capturedAtFilter } : {}),
      ...(qWhere ? { AND: [qWhere] } : {}),
      ...(cursorWhere ? { AND: [cursorWhere] } : {}),
    } as const;

    const orderBy =
      query.sort === "name"
        ? [
            { contactLastName: query.dir },
            { contactFirstName: query.dir },
            { capturedAt: "desc" as const },
            { id: "desc" as const },
          ]
        : [
            { capturedAt: query.dir },
            { id: query.dir },
          ];

    // For status filtering (meta.reviewedAt) we may need to fetch extra rows.
    // Keep it bounded for GoLive MVP.
    const scanTake = Math.min(query.take * 3 + 1, 401);

    const rows = await prisma.lead.findMany({
      where,
      orderBy,
      take: scanTake,
      select: {
        id: true,
        formId: true,
        eventId: true,
        capturedAt: true,
        isDeleted: true,

        contactFirstName: true,
        contactLastName: true,
        contactCompany: true,
        contactEmail: true,
        contactPhone: true,
        contactMobile: true,

        meta: true,

        event: { select: { id: true, name: true } },

        attachments: {
          where: { type: "BUSINESS_CARD_IMAGE" },
          select: { id: true },
          take: 1,
        },

        ocrResults: {
          select: { id: true },
          take: 1,
        },

        ...(query.includeValues ? ({ values: true } as const) : ({} as const)),
      },
    });

    const mapped = rows.map((r) => {
      const reviewedAt = extractReviewedAt(r.meta);
      const item = {
        id: r.id,

        createdAt: r.capturedAt.toISOString(),
        updatedAt: r.capturedAt.toISOString(),

        capturedAt: r.capturedAt.toISOString(),
        formId: r.formId,
        eventId: r.eventId ?? null,

        contactName: contactName(r.contactFirstName, r.contactLastName),
        company: r.contactCompany ?? null,
        email: r.contactEmail ?? null,
        phone: pickPhone(r.contactPhone, r.contactMobile),

        event: r.event ? { id: r.event.id, name: r.event.name } : null,

        reviewedAt,
        reviewStatus: reviewedAt ? ("REVIEWED" as const) : ("NEW" as const),

        hasCardAttachment: (r.attachments?.length ?? 0) > 0,
        hasOcr: (r.ocrResults?.length ?? 0) > 0,

        sourceDeviceName: extractSourceDeviceName(r.meta),

        ...(query.includeValues ? ({ values: (r as unknown as { values?: unknown }).values ?? {} } as const) : ({} as const)),
      };

      return { row: r, item };
    });

    const filtered =
      query.status === "ALL"
        ? mapped
        : mapped.filter((x) => (query.status === "REVIEWED" ? Boolean(x.item.reviewedAt) : !x.item.reviewedAt));

    const hasMore = filtered.length > query.take;
    const page = hasMore ? filtered.slice(0, query.take) : filtered;

    const nextCursor =
      hasMore && page.length > 0 ? encodeCursor(page[page.length - 1].row.capturedAt, page[page.length - 1].row.id) : null;

    return jsonOk(req, { items: page.map((p) => p.item), nextCursor });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_SERVER_ERROR", "Unexpected server error.");
  }
}
