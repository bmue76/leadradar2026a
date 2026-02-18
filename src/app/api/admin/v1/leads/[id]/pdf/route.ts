export const runtime = "nodejs";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type LeadDetail = {
  id: string;
  createdAt: string | null;
  updatedAt: string | null;
  capturedAt: string | null;
  reviewStatus: "NEW" | "REVIEWED";
  reviewedAt: string | null;
  adminNotes: string | null;
  contact: {
    firstName: string | null;
    lastName: string | null;
    name: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
    phoneRaw: string | null;
    mobile: string | null;
  };
  event: { id: string; name: string } | null;
  form: { id: string; name: string } | null;
  values?: unknown;
};

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function safeStr(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const s = String(v);
  return s.trim() ? s : "—";
}

function wrapLines(text: string, maxChars: number): string[] {
  const t = (text ?? "").replace(/\r\n/g, "\n");
  const words = t.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";

  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : ["—"];
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const traceId = crypto.randomUUID();
  const { id } = ctx.params;

  try {
    const url = new URL(req.url);
    const base = `${url.protocol}//${url.host}`;

    // Reuse existing auth/scoping by calling the existing lead-detail endpoint.
    const res = await fetch(`${base}/api/admin/v1/leads/${id}`, {
      method: "GET",
      headers: req.headers,
      cache: "no-store",
    });

    const json = (await res.json()) as ApiResp<LeadDetail>;
    if (!json || typeof json !== "object") {
      return Response.json(
        { ok: false, error: { code: "BAD_RESPONSE", message: "Ungültige Serverantwort." }, traceId } satisfies ApiErr,
        { status: 502 }
      );
    }

    if (!json.ok) {
      return Response.json(json, { status: res.status || 400 });
    }

    const d = json.data;

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const marginX = 48;
    let y = height - 56;

    const draw = (txt: string, opts?: { bold?: boolean; size?: number; color?: { r: number; g: number; b: number } }) => {
      const size = opts?.size ?? 11;
      const f = opts?.bold ? fontBold : font;
      const col = opts?.color ?? { r: 0.06, g: 0.09, b: 0.16 };
      page.drawText(txt, { x: marginX, y, size, font: f, color: rgb(col.r, col.g, col.b) });
      y -= size + 6;
    };

    draw("LeadRadar – Lead Rapport", { bold: true, size: 18 });
    draw(`Lead-ID: ${safeStr(d.id)}`, { size: 10, color: { r: 0.35, g: 0.4, b: 0.48 } });
    y -= 6;

    draw("Meta", { bold: true, size: 12 });
    draw(`Erfasst: ${fmtDateTime(d.createdAt)}`);
    draw(`Erfasst (captured): ${fmtDateTime(d.capturedAt)}`);
    draw(`Status: ${d.reviewStatus === "REVIEWED" ? "Bearbeitet" : "Neu"}`);
    draw(`Event: ${safeStr(d.event?.name)}`);
    draw(`Formular: ${safeStr(d.form?.name)}`);
    y -= 6;

    draw("Kontakt", { bold: true, size: 12 });
    draw(`Name: ${safeStr(d.contact?.name)}`);
    draw(`Firma: ${safeStr(d.contact?.company)}`);
    draw(`E-Mail: ${safeStr(d.contact?.email)}`);
    draw(`Telefon: ${safeStr(d.contact?.phoneRaw ?? d.contact?.phone)}`);
    draw(`Mobile: ${safeStr(d.contact?.mobile)}`);
    y -= 6;

    draw("Notizen", { bold: true, size: 12 });
    const notes = d.adminNotes?.trim() ? d.adminNotes.trim() : "—";
    for (const ln of wrapLines(notes, 92)) draw(ln);

    y -= 6;

    // values (optional via query)
    const qp = new URL(req.url).searchParams;
    const includeValues = qp.get("includeValues");
    const shouldInclude = includeValues === null ? true : includeValues === "1" || includeValues === "true";

    if (shouldInclude) {
      draw("Lead-Felder (values)", { bold: true, size: 12 });
      let v = "—";
      try {
        if (d.values !== undefined) {
          v = JSON.stringify(d.values, null, 2);
          if (v.length > 5000) v = v.slice(0, 5000) + "\n… (gekürzt)";
        }
      } catch {
        v = "—";
      }
      const lines = v.split("\n");
      for (const ln of lines.slice(0, 120)) {
        if (y < 80) break;
        draw(ln, { size: 9, color: { r: 0.18, g: 0.22, b: 0.3 } });
      }
    }

    const bytes = await pdf.save();

    const disp = qp.get("disposition") === "inline" ? "inline" : "attachment";
    const filename = `leadradar-lead-${d.id}.pdf`;

    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${disp}; filename="${filename}"`,
        "cache-control": "no-store",
        "x-trace-id": traceId,
      },
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: { code: "PDF_FAILED", message: "Konnte PDF nicht erstellen.", details: String(e) }, traceId } satisfies ApiErr,
      { status: 500 }
    );
  }
}
