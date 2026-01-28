import { csvLine, withUtf8Bom } from "@/lib/csv";

export type CsvDelimiter = ";" | ",";

export type CsvContactSource = "BUSINESS_CARD" | "MANUAL" | "QR" | "LINKEDIN" | "NONE";
export type CsvOcrStatus = "NONE" | "PENDING" | "DONE" | "FAILED";

export const CSV_FIXED_COLUMNS: readonly string[] = [
  // Kontext / Identifikation
  "tenant_slug",
  "event_id",
  "event_name",
  "form_id",
  "form_name",
  "lead_id",
  "lead_created_at",
  "lead_updated_at",

  // Kontakt (fix, CRM-friendly)
  "contact_source",
  "contact_first_name",
  "contact_last_name",
  "contact_full_name",
  "contact_company",
  "contact_title",
  "contact_email",
  "contact_phone",
  "contact_mobile",
  "contact_website",
  "contact_linkedin_url",

  // Adresse (fix, optional aber stabil)
  "contact_street",
  "contact_zip",
  "contact_city",
  "contact_country",

  // OCR / Qualität (fix, optional)
  "ocr_status",
  "ocr_confidence",
  "ocr_warnings",

  // Visitenkarte Attachment (fix, optional)
  "business_card_attachment_id",
  "business_card_image_url",
  "business_card_image_sha256",
];

export type CsvFieldKey = { formId: string; key: string };

type LeadAttachmentLite = { id: string };
type LeadOcrLite = {
  status?: string | null;
  confidence?: number | null;
  errorCode?: string | null;
  correctedAt?: Date | null;
};

export type LeadForCsv = {
  id: string;
  formId: string;
  capturedAt: Date | null;

  form?: { name: string } | null;
  eventId?: string | null;
  event?: { name: string } | null;

  // contact_*
  contactFirstName?: string | null;
  contactLastName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactMobile?: string | null;
  contactCompany?: string | null;
  contactTitle?: string | null;
  contactWebsite?: string | null;
  contactStreet?: string | null;
  contactZip?: string | null;
  contactCity?: string | null;
  contactCountry?: string | null;

  contactSource?: string | null;
  contactUpdatedAt?: Date | null;

  // attachments (pick BUSINESS_CARD_IMAGE outside)
  attachments?: LeadAttachmentLite[];

  // latest OCR result (kind BUSINESS_CARD), if available
  ocrResults?: LeadOcrLite[];

  // form values
  values?: unknown;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function normalizeFieldKey(raw: string): string {
  const base = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "field";
}

function asIso(d: Date | null | undefined): string {
  if (!d) return "";
  const t = d.getTime();
  if (!Number.isFinite(t)) return "";
  return d.toISOString();
}

function mapContactSource(v: string | null | undefined): CsvContactSource {
  const s = String(v || "").toUpperCase();

  // internal LeadContactSource: MANUAL | OCR_MOBILE | OCR_ADMIN (Schema)
  if (!s) return "NONE";
  if (s === "MANUAL") return "MANUAL";
  if (s === "OCR_MOBILE" || s === "OCR_ADMIN") return "BUSINESS_CARD";

  // future
  if (s === "QR") return "QR";
  if (s === "LINKEDIN") return "LINKEDIN";

  return "NONE";
}

function mapOcrStatus(v: string | null | undefined): CsvOcrStatus {
  const s = String(v || "").toUpperCase();
  if (!s) return "NONE";
  if (s === "PENDING") return "PENDING";
  if (s === "COMPLETED") return "DONE";
  if (s === "DONE") return "DONE";
  if (s === "FAILED") return "FAILED";
  return "NONE";
}

function joinName(first: string | null | undefined, last: string | null | undefined): string {
  const f = (first || "").trim();
  const l = (last || "").trim();
  const full = `${f} ${l}`.trim();
  return full;
}

function valueToCell(v: unknown): string {
  if (v === null || v === undefined) return "";

  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);

  // Arrays: contract says semicolon-separated list, independent of CSV delimiter.
  if (Array.isArray(v)) {
    const parts = v
      .map((x) => {
        if (x === null || x === undefined) return "";
        if (typeof x === "string" || typeof x === "number" || typeof x === "boolean") return String(x);
        try {
          return JSON.stringify(x);
        } catch {
          return String(x);
        }
      })
      .filter((x) => x.trim().length > 0);
    return parts.join(";");
  }

  if (isPlainObject(v)) {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }

  return String(v);
}

function pickBusinessCardAttachmentId(lead: LeadForCsv): string {
  const a = lead.attachments && Array.isArray(lead.attachments) ? lead.attachments[0] : null;
  return a?.id ? String(a.id) : "";
}

function buildOcrWarnings(ocr: LeadOcrLite | null | undefined, mappedStatus: CsvOcrStatus): string {
  if (!ocr) return "";
  const tags: string[] = [];

  if (mappedStatus === "PENDING") tags.push("pending");
  if (mappedStatus === "FAILED" && ocr.errorCode) tags.push(`error:${String(ocr.errorCode)}`);
  if (ocr.correctedAt) tags.push("corrected");

  // keep short; can be extended later
  return tags.join(";");
}

export function buildLeadsCsvContract(opts: {
  tenantSlug: string;
  leads: LeadForCsv[];
  fieldKeys: CsvFieldKey[];
  delimiter: CsvDelimiter;
  includeBom?: boolean;
}): { csvText: string; rowCount: number; delimiter: CsvDelimiter; columns: string[] } {
  const delimiter = opts.delimiter;

  // Union of field keys (contract: Option A = current schema)
  const seenCols = new Set<string>();
  const dynamic: Array<{ originalKey: string; colName: string }> = [];

  for (const fk of opts.fieldKeys) {
    const originalKey = String(fk.key || "").trim();
    if (!originalKey) continue;

    const safeKey = normalizeFieldKey(originalKey);
    let col = `f_${safeKey}`;

    // ensure uniqueness if normalization collides
    if (seenCols.has(col)) {
      let i = 2;
      while (seenCols.has(`${col}_${i}`)) i += 1;
      col = `${col}_${i}`;
    }

    if (!seenCols.has(col)) {
      seenCols.add(col);
      dynamic.push({ originalKey, colName: col });
    }
  }

  dynamic.sort((a, b) => a.colName.localeCompare(b.colName));

  const columns = [...CSV_FIXED_COLUMNS, ...dynamic.map((d) => d.colName)];
  const lines: string[] = [];
  lines.push(csvLine(columns, delimiter));

  for (const lead of opts.leads) {
    const formName = lead.form?.name ?? "";
    const eventId = lead.eventId ?? "";
    const eventName = lead.event?.name ?? "";

    const contactFirst = lead.contactFirstName ?? "";
    const contactLast = lead.contactLastName ?? "";
    const contactFull = joinName(contactFirst, contactLast);

    const ocr = lead.ocrResults && Array.isArray(lead.ocrResults) && lead.ocrResults.length > 0 ? lead.ocrResults[0] : null;
    const ocrStatus = mapOcrStatus(ocr?.status ?? null);

    const businessCardAttachmentId = pickBusinessCardAttachmentId(lead);
    const businessCardImageUrl = businessCardAttachmentId
      ? `/api/admin/v1/leads/${lead.id}/attachments/${businessCardAttachmentId}/download`
      : "";

    const fixedValues: unknown[] = [
      // Kontext
      opts.tenantSlug,
      eventId,
      eventName,
      lead.formId,
      formName,
      lead.id,
      asIso(lead.capturedAt),
      "",

      // Kontakt
      mapContactSource(lead.contactSource ?? null),
      contactFirst,
      contactLast,
      contactFull,
      lead.contactCompany ?? "",
      lead.contactTitle ?? "",
      lead.contactEmail ?? "",
      lead.contactPhone ?? "",
      lead.contactMobile ?? "",
      lead.contactWebsite ?? "",
      "", // linkedin_url (stable column, currently not stored)

      // Adresse
      lead.contactStreet ?? "",
      lead.contactZip ?? "",
      lead.contactCity ?? "",
      lead.contactCountry ?? "",

      // OCR
      ocrStatus,
      typeof ocr?.confidence === "number" ? String(ocr.confidence) : "",
      buildOcrWarnings(ocr, ocrStatus),

      // Visitenkarte
      businessCardAttachmentId,
      businessCardImageUrl,
      "", // sha256 (optional; not available in MVP)
    ];

    const valuesObj = isPlainObject(lead.values) ? (lead.values as Record<string, unknown>) : {};

    const dynValues = dynamic.map((d) => valueToCell(valuesObj[d.originalKey]));
    lines.push(csvLine([...fixedValues, ...dynValues], delimiter));
  }

  const text = lines.join("\n") + "\n";
  const csvText = opts.includeBom === false ? text : withUtf8Bom(text);

  return { csvText, rowCount: opts.leads.length, delimiter, columns };
}
