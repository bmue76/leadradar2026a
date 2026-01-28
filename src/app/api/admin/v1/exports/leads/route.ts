import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant";
import { buildLeadsCsvTextForTenant, type CsvExportParams } from "@/lib/exportCsv";

export const runtime = "nodejs";

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

function parseDelimiter(v: string | null): ";" | "," {
  if (!v) return ";";
  const t = v.trim().toLowerCase();
  if (!t) return ";";
  if (t === "semicolon") return ";";
  if (t === "comma") return ",";
  if (t === ";") return ";";
  if (t === ",") return ",";
  // be tolerant: allow single char, but only accept ; or ,
  const ch = t.slice(0, 1);
  return ch === "," ? "," : ";";
}

const QuerySchema = z.object({
  eventId: z
    .preprocess((v: unknown) => (typeof v === "string" ? v.trim() : v), z.string().min(1).max(128))
    .optional(),
  formId: z
    .preprocess((v: unknown) => (typeof v === "string" ? v.trim() : v), z.string().min(1).max(128))
    .optional(),
  from: z
    .preprocess((v: unknown) => (typeof v === "string" ? v.trim() : v), z.string().min(10).max(64))
    .optional(),
  to: z
    .preprocess((v: unknown) => (typeof v === "string" ? v.trim() : v), z.string().min(10).max(64))
    .optional(),
});

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

    const params: CsvExportParams = {
      eventId: parsed.data.eventId ?? null,
      formId: parsed.data.formId ?? null,
      includeDeleted,
      from: parsed.data.from ?? null,
      to: parsed.data.to ?? null,
      limit,
      delimiter,
    };

    const built = await buildLeadsCsvTextForTenant({ tenantId, params });

    const filename = `leads-export-${fileTimestampUtc()}.csv`;

    return new Response(built.csvText, {
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
