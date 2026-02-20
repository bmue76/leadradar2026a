import PDFDocument from "pdfkit";

export type LeadPdfField = { label: string; value: string };

export type LeadPdfPayload = {
  tenantSlug: string;
  tenantName?: string | null;

  eventName?: string | null;
  formName?: string | null;

  leadId: string;

  capturedAt?: string | null;
  createdAt?: string | null;

  contactName?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;

  notes?: string | null;

  fields: LeadPdfField[];
};

function sanitizeFilePart(input: string): string {
  const s = input
    .trim()
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  return s.length > 60 ? s.slice(0, 60).trim() : s;
}

function datePart(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function buildLeadPdfFileName(p: LeadPdfPayload): string {
  const d = datePart(p.capturedAt) || datePart(p.createdAt) || datePart(new Date().toISOString());
  const tenant = sanitizeFilePart(p.tenantSlug || "tenant");
  const ev = sanitizeFilePart(p.eventName || "");
  const form = sanitizeFilePart(p.formName || "");
  const who = sanitizeFilePart(p.contactName || p.company || "");
  const id = sanitizeFilePart(p.leadId || "lead");

  const parts = [d, tenant, ev, form, who, id].filter(Boolean);
  const base = parts.join("_").replace(/_+/g, "_").slice(0, 160);
  return `${base}.pdf`;
}

function safeText(v: unknown): string {
  const s = typeof v === "string" ? v : v == null ? "" : String(v);
  return s.trim();
}

function drawHeader(args: {
  doc: PDFKit.PDFDocument;
  logo?: Buffer | null;
  eventName: string;
  formName: string;
}) {
  const { doc, logo, eventName, formName } = args;

  const top = doc.y;
  const left = doc.page.margins.left;

  if (logo && logo.length > 0) {
    try {
      doc.image(logo, left, top, { fit: [120, 42] });
    } catch {
      // ignore invalid image
    }
  }

  const titleX = left + 140;
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor("#111827")
    .text(eventName || "Event", titleX, top, { width: 400 });

  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#374151")
    .text(formName || "", titleX, top + 22, { width: 400 });

  doc.moveDown(2);
  doc.moveTo(left, top + 54).lineTo(doc.page.width - doc.page.margins.right, top + 54).strokeColor("#E5E7EB").stroke();

  doc.y = top + 66;
}

function labelValueLine(doc: PDFKit.PDFDocument, label: string, value: string) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const labelWidth = 130;

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#111827")
    .text(label, left, doc.y, { width: labelWidth });

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#111827")
    .text(value || "—", left + labelWidth, doc.y, { width: right - left - labelWidth });

  doc.moveDown(0.6);
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.6);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827").text(title);
  doc.moveDown(0.4);
}

export async function renderLeadPdf(args: {
  payload: LeadPdfPayload;
  logoPng?: Buffer | null;
}): Promise<Uint8Array> {
  const { payload, logoPng } = args;

  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    info: {
      Title: `Lead ${payload.leadId}`,
      Author: "LeadRadar",
    },
  });

  const chunks: Buffer[] = [];
  const out = new Promise<Uint8Array>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawHeader({
    doc,
    logo: logoPng ?? null,
    eventName: safeText(payload.eventName) || "Event",
    formName: safeText(payload.formName) || "",
  });

  sectionTitle(doc, "Lead");

  labelValueLine(doc, "Kontakt", safeText(payload.contactName) || "—");
  labelValueLine(doc, "Firma", safeText(payload.company) || "—");
  labelValueLine(doc, "E-Mail", safeText(payload.email) || "—");
  labelValueLine(doc, "Telefon", safeText(payload.phone) || "—");
  labelValueLine(doc, "Mobile", safeText(payload.mobile) || "—");
  labelValueLine(doc, "Erfasst am", safeText(payload.capturedAt || payload.createdAt) || "—");
  labelValueLine(doc, "Lead-ID", safeText(payload.leadId));

  if (payload.notes && safeText(payload.notes)) {
    sectionTitle(doc, "Notiz");
    doc.font("Helvetica").fontSize(10).fillColor("#111827").text(safeText(payload.notes), {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });
  }

  sectionTitle(doc, "Formularfelder");

  if (!payload.fields || payload.fields.length === 0) {
    doc.font("Helvetica").fontSize(10).fillColor("#6B7280").text("Keine Formularfelder vorhanden.");
  } else {
    for (const f of payload.fields) {
      const label = safeText(f.label) || "Feld";
      const value = safeText(f.value) || "—";
      labelValueLine(doc, label, value);
    }
  }

  doc.end();
  return out;
}
