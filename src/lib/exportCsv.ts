import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { putTextFile } from "@/lib/storage";
import { buildLeadsCsvContract, type CsvDelimiter, type CsvFieldKey, type LeadForCsv } from "@/lib/csvContract";

export type CsvExportParams = {
  eventId?: string | null;
  formId?: string | null;
  includeDeleted?: boolean;
  from?: string | null; // ISO or YYYY-MM-DD
  to?: string | null; // ISO or YYYY-MM-DD
  limit?: number | null;
  delimiter?: CsvDelimiter;
};

export type CsvExportResult = {
  relativeStorageKey: string; // "<tenantId>/<jobId>.csv"
  rowCount: number;
  delimiter: CsvDelimiter;
};

function parseDateMaybe(s: string | null | undefined, mode: "from" | "to"): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  if (dateOnly) {
    if (mode === "from") return new Date(trimmed + "T00:00:00.000Z");
    return new Date(trimmed + "T23:59:59.999Z");
  }

  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function clampLimit(v: number | null | undefined, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(Math.max(n, 1), 100000);
}

async function resolveTenantSlug(tenantId: string): Promise<string> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  return t?.slug ?? "";
}

const LeadCsvSelect = Prisma.validator<Prisma.LeadSelect>()({
  id: true,
  formId: true,
  eventId: true,
  capturedAt: true,
  values: true,

  contactFirstName: true,
  contactLastName: true,
  contactEmail: true,
  contactPhone: true,
  contactMobile: true,
  contactCompany: true,
  contactTitle: true,
  contactWebsite: true,
  contactStreet: true,
  contactZip: true,
  contactCity: true,
  contactCountry: true,

  contactSource: true,
  contactUpdatedAt: true,

  form: { select: { name: true } },
  event: { select: { name: true } },

  attachments: {
    where: { type: "BUSINESS_CARD_IMAGE" },
    take: 1,
    select: { id: true },
  },

  ocrResults: {
    where: { kind: "BUSINESS_CARD" },
    orderBy: { updatedAt: "desc" },
    take: 1,
    select: {
      status: true,
      confidence: true,
      errorCode: true,
      correctedAt: true,
    },
  },
});

type LeadCsvRow = Prisma.LeadGetPayload<{ select: typeof LeadCsvSelect }>;

export async function buildLeadsCsvTextForTenant(opts: {
  tenantId: string;
  params: CsvExportParams;
}): Promise<{ csvText: string; rowCount: number; delimiter: CsvDelimiter }> {
  const delimiter: CsvDelimiter = opts.params.delimiter ?? ";";
  const includeDeleted = opts.params.includeDeleted ?? false;
  const limit = clampLimit(opts.params.limit ?? null, 10000);

  const fromDate = parseDateMaybe(opts.params.from, "from");
  const toDate = parseDateMaybe(opts.params.to, "to");

  const where: Prisma.LeadWhereInput = { tenantId: opts.tenantId };

  if (opts.params.eventId) where.eventId = opts.params.eventId;
  if (opts.params.formId) where.formId = opts.params.formId;
  if (!includeDeleted) where.isDeleted = false;

  if (fromDate || toDate) {
    where.capturedAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  const leads = (await prisma.lead.findMany({
    where,
    orderBy: { capturedAt: "asc" },
    take: limit,
    select: LeadCsvSelect,
  })) as LeadCsvRow[];

  // field keys: Option A (current schema)
  const formIds =
    opts.params.formId && typeof opts.params.formId === "string" && opts.params.formId.trim().length > 0
      ? [opts.params.formId]
      : Array.from(new Set(leads.map((l) => l.formId)));

  let fieldKeys: CsvFieldKey[] = [];
  if (formIds.length > 0) {
    fieldKeys = await prisma.formField.findMany({
      where: { tenantId: opts.tenantId, formId: { in: formIds }, isActive: true },
      select: { formId: true, key: true },
      orderBy: [{ formId: "asc" }, { sortOrder: "asc" }, { key: "asc" }],
    });
  }

  const tenantSlug = await resolveTenantSlug(opts.tenantId);

  const csvBuilt = buildLeadsCsvContract({
    tenantSlug,
    leads: leads as unknown as LeadForCsv[],
    fieldKeys,
    delimiter,
    includeBom: true,
  });

  return { csvText: csvBuilt.csvText, rowCount: csvBuilt.rowCount, delimiter: csvBuilt.delimiter };
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
  const built = await buildLeadsCsvTextForTenant({ tenantId: opts.tenantId, params: opts.params });
  const relativeStorageKey = await writeLeadsCsvToDevStorage({
    tenantId: opts.tenantId,
    jobId: opts.jobId,
    csvText: built.csvText,
  });

  return { relativeStorageKey, rowCount: built.rowCount, delimiter: built.delimiter };
}
