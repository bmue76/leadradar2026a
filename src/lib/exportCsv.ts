import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { csvLine, withUtf8Bom } from "@/lib/csv";
import { putTextFile } from "@/lib/storage";

export type CsvExportParams = {
  eventId?: string | null;
  formId?: string | null;
  includeDeleted?: boolean;
  from?: string | null; // ISO or YYYY-MM-DD
  to?: string | null; // ISO or YYYY-MM-DD
  limit?: number | null;
  delimiter?: ";" | ",";
};

export type CsvExportResult = {
  relativeStorageKey: string; // "<tenantId>/<jobId>.csv"
  rowCount: number;
  delimiter: ";" | ",";
};

function parseDateMaybe(s: string | null | undefined, mode: "from" | "to"): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;

  // If date-only, treat "to" as end-of-day UTC to be more intuitive for filters.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  if (dateOnly) {
    if (mode === "from") return new Date(trimmed + "T00:00:00.000Z");
    return new Date(trimmed + "T23:59:59.999Z");
  }

  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function buildLeadsCsv(opts: {
  tenantId: string;
  params: CsvExportParams;
}): Promise<{ csvText: string; rowCount: number; delimiter: ";" | "," }> {
  const delimiter: ";" | "," = opts.params.delimiter ?? ";";
  const includeDeleted = opts.params.includeDeleted ?? false;
  const limit = opts.params.limit ?? 10000;

  const fromDate = parseDateMaybe(opts.params.from, "from");
  const toDate = parseDateMaybe(opts.params.to, "to");

  const where: Prisma.LeadWhereInput = {
    tenantId: opts.tenantId,
  };

  if (opts.params.eventId) where.eventId = opts.params.eventId;
  if (opts.params.formId) where.formId = opts.params.formId;
  if (!includeDeleted) where.isDeleted = false;

  if (fromDate || toDate) {
    where.capturedAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { capturedAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100000),
    select: {
      id: true,
      eventId: true,
      formId: true,
      capturedAt: true,
      isDeleted: true,
      deletedAt: true,
      deletedReason: true,
      values: true,
    },
  });

  // Stable deterministic columns (TP 3.4)
  const header = csvLine(
    ["leadId", "eventId", "formId", "capturedAt", "isDeleted", "deletedAt", "deletedReason", "values_json"],
    delimiter
  );

  const lines: string[] = [header];

  for (const l of leads) {
    const valuesJson = JSON.stringify(l.values ?? {});
    lines.push(
      csvLine(
        [
          l.id,
          l.eventId ?? "",
          l.formId,
          l.capturedAt?.toISOString() ?? "",
          l.isDeleted ? "true" : "false",
          l.deletedAt ? l.deletedAt.toISOString() : "",
          l.deletedReason ?? "",
          valuesJson,
        ],
        delimiter
      )
    );
  }

  const csvText = withUtf8Bom(lines.join("\n") + "\n");
  return { csvText, rowCount: leads.length, delimiter };
}

export async function writeLeadsCsvToDevStorage(opts: {
  tenantId: string;
  jobId: string;
  csvText: string;
}): Promise<string> {
  // Store under .tmp_exports/<tenantId>/<jobId>.csv
  const relativeStorageKey = `${opts.tenantId}/${opts.jobId}.csv`;
  await putTextFile({
    rootDirName: ".tmp_exports",
    relativeKey: relativeStorageKey,
    content: opts.csvText,
  });
  return relativeStorageKey;
}

export async function runCsvExport(opts: {
  tenantId: string;
  jobId: string;
  params: CsvExportParams;
}): Promise<CsvExportResult> {
  const built = await buildLeadsCsv({ tenantId: opts.tenantId, params: opts.params });
  const relativeStorageKey = await writeLeadsCsvToDevStorage({
    tenantId: opts.tenantId,
    jobId: opts.jobId,
    csvText: built.csvText,
  });

  return { relativeStorageKey, rowCount: built.rowCount, delimiter: built.delimiter };
}
