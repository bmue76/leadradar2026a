import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

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

function detectImageType(buf: Uint8Array): "png" | "jpg" | null {
  if (buf.length >= 8) {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    ) {
      return "png";
    }
  }
  if (buf.length >= 3) {
    // JPEG signature: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  }
  return null;
}

function wrapText(args: { text: string; font: PDFFont; size: number; maxWidth: number }): string[] {
  const { text, font, size, maxWidth } = args;
  const raw = (text ?? "").trim();
  if (!raw) return ["—"];

  const words = raw.split(/\s+/);
  const lines: string[] = [];
  let cur = "";

  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    const width = font.widthOfTextAtSize(cand, size);
    if (width <= maxWidth) {
      cur = cand;
      continue;
    }

    if (cur) lines.push(cur);
    cur = w;

    // single very long word => hard split
    while (font.widthOfTextAtSize(cur, size) > maxWidth && cur.length > 8) {
      const cut = Math.max(8, Math.floor(cur.length * 0.7));
      lines.push(cur.slice(0, cut));
      cur = cur.slice(cut);
    }
  }

  if (cur) lines.push(cur);
  return lines.length ? lines : ["—"];
}

export async function renderLeadPdf(args: { payload: LeadPdfPayload; logoPng?: Buffer | null }): Promise<Uint8Array> {
  const { payload, logoPng } = args;

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // A4 in points
  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 40;
  const left = margin;
  const right = pageW - margin;
  const top = pageH - margin;
  const bottom = margin;

  const colorText = rgb(0.067, 0.094, 0.153); // slate-900-ish
  const colorMuted = rgb(0.216, 0.254, 0.318); // slate-700-ish
  const colorLine = rgb(0.898, 0.91, 0.925); // slate-200-ish

  let page = pdfDoc.addPage([pageW, pageH]);
  let yTop = top;

  const lineHeight = (size: number) => size * 1.35;

  function ensureSpace(heightNeeded: number) {
    if (yTop - heightNeeded >= bottom) return;

    page = pdfDoc.addPage([pageW, pageH]);
    yTop = top;

    // light repeat header (no logo)
    const title = safeText(payload.eventName) || "Event";
    const subtitle = safeText(payload.formName) || "";
    page.drawText(title, { x: left, y: yTop - 16, size: 12, font: fontBold, color: colorText });
    if (subtitle) page.drawText(subtitle, { x: left, y: yTop - 32, size: 10, font: fontRegular, color: colorMuted });
    page.drawLine({ start: { x: left, y: yTop - 44 }, end: { x: right, y: yTop - 44 }, thickness: 1, color: colorLine });
    yTop = yTop - 56;
  }

  async function drawHeader() {
    const title = safeText(payload.eventName) || "Event";
    const subtitle = safeText(payload.formName) || "";

    // logo (optional)
    if (logoPng && logoPng.length > 0) {
      try {
        const u8 = new Uint8Array(logoPng);
        const t = detectImageType(u8);
        if (t === "png") {
          const img = await pdfDoc.embedPng(u8);
          const maxW = 120;
          const maxH = 42;
          const scale = Math.min(maxW / img.width, maxH / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          page.drawImage(img, { x: left, y: yTop - h, width: w, height: h });
        } else if (t === "jpg") {
          const img = await pdfDoc.embedJpg(u8);
          const maxW = 120;
          const maxH = 42;
          const scale = Math.min(maxW / img.width, maxH / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          page.drawImage(img, { x: left, y: yTop - h, width: w, height: h });
        }
      } catch {
        // ignore logo errors
      }
    }

    const titleX = left + 140;
    page.drawText(title, { x: titleX, y: yTop - 18, size: 16, font: fontBold, color: colorText });
    if (subtitle) page.drawText(subtitle, { x: titleX, y: yTop - 36, size: 11, font: fontRegular, color: colorMuted });

    page.drawLine({
      start: { x: left, y: yTop - 54 },
      end: { x: right, y: yTop - 54 },
      thickness: 1,
      color: colorLine,
    });

    yTop = yTop - 70;
  }

  function sectionTitle(title: string) {
    ensureSpace(22);
    page.drawText(title, { x: left, y: yTop - 12, size: 11, font: fontBold, color: colorText });
    yTop -= 18;
  }

  function labelValue(label: string, value: string) {
    const labelW = 130;
    const gap = 10;
    const valueX = left + labelW + gap;
    const valueW = right - valueX;

    const size = 10;
    const lh = lineHeight(size);

    const valueLines = wrapText({ text: value || "—", font: fontRegular, size, maxWidth: valueW });
    const needed = Math.max(1, valueLines.length) * lh + 2;

    ensureSpace(needed);

    // label (single line)
    page.drawText(label, { x: left, y: yTop - size, size, font: fontBold, color: colorText });

    // value (multi line)
    let y = yTop;
    for (const line of valueLines) {
      page.drawText(line, { x: valueX, y: y - size, size, font: fontRegular, color: colorText });
      y -= lh;
    }

    yTop -= needed;
  }

  await drawHeader();

  sectionTitle("Lead");
  labelValue("Kontakt", safeText(payload.contactName) || "—");
  labelValue("Firma", safeText(payload.company) || "—");
  labelValue("E-Mail", safeText(payload.email) || "—");
  labelValue("Telefon", safeText(payload.phone) || "—");
  labelValue("Mobile", safeText(payload.mobile) || "—");
  labelValue("Erfasst am", safeText(payload.capturedAt || payload.createdAt) || "—");
  labelValue("Lead-ID", safeText(payload.leadId) || "—");

  if (payload.notes && safeText(payload.notes)) {
    sectionTitle("Notiz");
    const size = 10;
    const lh = lineHeight(size);
    const lines = wrapText({
      text: safeText(payload.notes),
      font: fontRegular,
      size,
      maxWidth: right - left,
    });
    ensureSpace(lines.length * lh + 8);

    let y = yTop;
    for (const line of lines) {
      page.drawText(line, { x: left, y: y - size, size, font: fontRegular, color: colorText });
      y -= lh;
    }
    yTop -= lines.length * lh + 6;
  }

  sectionTitle("Formularfelder");
  if (!payload.fields || payload.fields.length === 0) {
    labelValue("Info", "Keine Formularfelder vorhanden.");
  } else {
    for (const f of payload.fields) {
      labelValue(safeText(f.label) || "Feld", safeText(f.value) || "—");
    }
  }

  return pdfDoc.save();
}
