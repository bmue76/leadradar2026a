import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant";

export const runtime = "nodejs";

function safeJsonStringify(v: unknown): string {
  try {
    return JSON.stringify(v ?? null);
  } catch {
    return "";
  }
}

function csvEscape(value: unknown, delimiter: string): string {
  if (value === null || value === undefined) return "";

  let s: string;
  if (typeof value === "string") s = value;
  else if (typeof value === "number" || typeof value === "boolean") s = String(value);
  else s = safeJsonStringify(value);

  const needsQuote = s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(delimiter);
  if (!needsQuote) return s;

  return `"${s.replaceAll('"', '""')}"`;
}

function parseBool(v: string | null): boolean {
  if (!v) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes" || t === "y";
}

function parseLimit(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(200_000, n));
}

function parseDelimiter(v: string | null): string {
  if (!v) return ";";
  const t = v.trim();
  if (!t) return ";";
  // allow single char delimiters only
  return t.slice(0, 1);
}

function parseDateStart(from: string): Date | null {
  // expects YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  const d = new Date(`${from}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDateEndExclusive(to: string): Date | null {
  // end-exclusive: next day 00:00Z
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const d = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

async function resolveTenantIdForAdmin(req: Request): Promise<string> {
  try {
    const auth = await requireAdminAuth(req);
    return auth.tenantId;
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      const t = await requireTenantContext(req);
      return t.id;
    }
    throw e;
  }
}

const QuerySchema = z.object({
  eventId: z
    .preprocess((v: unknown) => (typeof v === "string" ? v.trim() : v), z.string().min(1).max(128))
    .optional(),
  formId: z
    .preprocess((v: unknown) => (typeof v === "string" ? v.trim() : v), z.string().min(1).max(128))
    .optional(),
  from: z
    .preprocess((v: unknown) => (typeof v === "string" ? v.trim() : v), z.string().min(10).max(10))
    .optional(),
  to: z
    .preprocess((v: unknown) => (typeof v === "string" ? v.trim() : v), z.string().min(10).max(10))
    .optional(),
});

function fileTimestampUtc(): string {
  const d = new Date();
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}Z`;
}

export async function GET(req: NextRequest) {
  try {
    const tenantId = await resolveTenantIdForAdmin(req);

    const url = new URL(req.url);
    const includeDeleted = parseBool(url.searchParams.get("includeDeleted"));
    const limit = parseLimit(url.searchParams.get("limit"), 10000);
    const delimiter = parseDelimiter(url.searchParams.get("delimiter"));

    const parsed = QuerySchema.safeParse({
      eventId: url.searchParams.get("eventId") ?? undefined,
      formId: url.searchParams.get("formId") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });

    if (!parsed.success) {
      return jsonError(req, 400, "BAD_REQUEST", "Invalid query parameters.", parsed.error.flatten());
    }

    const { eventId, formId, from, to } = parsed.data;

    const fromDt = from ? parseDateStart(from) : null;
    const toExcl = to ? parseDateEndExclusive(to) : null;

    if (from && !fromDt) return jsonError(req, 400, "BAD_REQUEST", "Invalid 'from' (expected YYYY-MM-DD).");
    if (to && !toExcl) return jsonError(req, 400, "BAD_REQUEST", "Invalid 'to' (expected YYYY-MM-DD).");
    if (fromDt && toExcl && fromDt.getTime() >= toExcl.getTime()) {
      return jsonError(req, 400, "BAD_REQUEST", '"from" must be before or equal to "to".');
    }

    const leads = await prisma.lead.findMany({
      where: {
        tenantId,
        ...(eventId ? { eventId } : {}),
        ...(formId ? { formId } : {}),
        ...(includeDeleted ? {} : { isDeleted: false }),
        ...(fromDt || toExcl
          ? {
              capturedAt: {
                ...(fromDt ? { gte: fromDt } : {}),
                ...(toExcl ? { lt: toExcl } : {}),
              },
            }
          : {}),
      },
      orderBy: { capturedAt: "desc" },
      take: limit,
      select: {
        id: true,
        formId: true,
        eventId: true,
        capturedAt: true,
        values: true,
        meta: true,
        isDeleted: true,
        deletedAt: true,
        deletedReason: true,
        form: { select: { name: true } },
      },
    });

    const columns = [
      "lead_id",
      "form_id",
      "form_name",
      "event_id",
      "captured_at",
      "is_deleted",
      "deleted_at",
      "deleted_reason",
      "values_json",
      "meta_json",
    ];

    const lines: string[] = [];
    lines.push(columns.join(delimiter));

    for (const l of leads) {
      const row: unknown[] = [
        l.id,
        l.formId,
        l.form?.name ?? "",
        l.eventId ?? "",
        l.capturedAt?.toISOString?.() ? l.capturedAt.toISOString() : "",
        l.isDeleted ? "1" : "0",
        l.deletedAt ? l.deletedAt.toISOString() : "",
        l.deletedReason ?? "",
        safeJsonStringify(l.values ?? {}),
        safeJsonStringify(l.meta ?? null),
      ];

      lines.push(row.map((v) => csvEscape(v, delimiter)).join(delimiter));
    }

    const csv = lines.join("\n");
    const filename = `leads-export-${fileTimestampUtc()}.csv`;

    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL", "Unexpected server error.");
  }
}
