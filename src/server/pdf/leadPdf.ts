/**
 * LeadRadar2026A – Server PDF helper
 * Minimal PDF generator without external deps (Node-only).
 *
 * Purpose:
 * - Provide a stable module for API routes importing "@/server/pdf/leadPdf"
 * - Unblock typecheck/build when refactoring PDFs
 *
 * Later:
 * - Replace internals with the real renderer (React PDF / Playwright / PDFKit etc.)
 */

export type LeadPdfPayload = Record<string, unknown>;

function escapePdfText(input: string): string {
  // Escape backslashes and parentheses for PDF literal strings
  return input.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function toLines(payload: LeadPdfPayload): string[] {
  const header = "LeadRadar – Lead PDF";
  const ts = new Date().toISOString();
  let body = "";
  try {
    body = JSON.stringify(payload ?? {}, null, 2);
  } catch {
    body = "[payload unserializable]";
  }

  const rawLines = [header, `Generated: ${ts}`, "", body];
  const lines: string[] = [];
  for (const block of rawLines) {
    // split into reasonable line lengths for display
    const parts = String(block).split("\n");
    for (const p of parts) {
      const s = p ?? "";
      if (s.length <= 110) {
        lines.push(s);
      } else {
        for (let i = 0; i < s.length; i += 110) {
          lines.push(s.slice(i, i + 110));
        }
      }
    }
  }
  return lines.slice(0, 200); // hard safety cap
}

function buildMinimalPdf(lines: string[]): Uint8Array {
  // PDF basics:
  // 1 Catalog, 1 Pages, 1 Page, 1 Contents, 1 Font
  // We must compute byte offsets for xref.

  const fontObj = `5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
`;

  const mediaBox = "[0 0 612 792]"; // US Letter
  const startX = 72;
  const startY = 740;
  const lineHeight = 14;

  // Build content stream (simple text)
  const textOps: string[] = [];
  textOps.push("BT");
  textOps.push("/F1 12 Tf");
  textOps.push(`${startX} ${startY} Td`);
  for (let i = 0; i < lines.length; i++) {
    const txt = escapePdfText(lines[i] ?? "");
    textOps.push(`(${txt}) Tj`);
    if (i !== lines.length - 1) textOps.push(`0 -${lineHeight} Td`);
  }
  textOps.push("ET");
  const contentStream = textOps.join("\n") + "\n";
  const contentLen = Buffer.byteLength(contentStream, "utf8");

  const contentsObj = `4 0 obj
<< /Length ${contentLen} >>
stream
${contentStream}endstream
endobj
`;

  const pageObj = `3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox ${mediaBox} /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
`;

  const pagesObj = `2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
`;

  const catalogObj = `1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
`;

  const header = "%PDF-1.4\n%âãÏÓ\n";

  const objects = [catalogObj, pagesObj, pageObj, contentsObj, fontObj];

  // Compute xref offsets
  const chunks: Buffer[] = [];
  chunks.push(Buffer.from(header, "binary"));

  const offsets: number[] = [];
  offsets.push(0); // object 0 is free
  let pos = Buffer.byteLength(header, "binary");

  for (const obj of objects) {
    offsets.push(pos);
    const b = Buffer.from(obj, "utf8");
    chunks.push(b);
    pos += b.length;
  }

  const xrefStart = pos;

  // xref table
  // We have objects 0..5 (6 entries)
  let xref = "xref\n0 6\n";
  xref += "0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) {
    const off = offsets[i];
    const offStr = String(off).padStart(10, "0");
    xref += `${offStr} 00000 n \n`;
  }

  const trailer = `trailer
<< /Size 6 /Root 1 0 R >>
startxref
${xrefStart}
%%EOF
`;

  chunks.push(Buffer.from(xref, "utf8"));
  chunks.push(Buffer.from(trailer, "utf8"));

  return Buffer.concat(chunks);
}

/**
 * Render a PDF for a Lead (server-side).
 * Returns raw PDF bytes (Uint8Array/Buffer-compatible).
 */
export async function renderLeadPdf(payload: LeadPdfPayload): Promise<Uint8Array> {
  const lines = toLines(payload);
  return buildMinimalPdf(lines);
}
