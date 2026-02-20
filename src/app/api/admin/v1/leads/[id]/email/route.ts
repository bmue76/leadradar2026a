import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendMail } from "@/lib/email/mailer";
import { buildLeadPdfFileName, renderLeadPdf, type LeadPdfPayload } from "@/server/pdf/leadPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

const BodySchema = z.object({
  to: z.string().min(3).email(),
  subject: z.string().optional(),
  message: z.string().optional(),
  includeValues: z.boolean().optional().default(true),
  includePdf: z.boolean().optional().default(false),
});

function hdr(req: NextRequest, name: string): string {
  return (req.headers.get(name) ?? "").trim();
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return copy.buffer;
}

async function fetchJson<T>(req: NextRequest, path: string): Promise<ApiResp<T>> {
  const url = new URL(path, req.url);
  const cookie = req.headers.get("cookie") ?? "";
  const res = await fetch(url, {
    method: "GET",
    headers: {
      cookie,
      "x-mw-internal": "1",
      "x-tenant-slug": hdr(req, "x-tenant-slug"),
      "x-tenant-id": hdr(req, "x-tenant-id"),
      "x-user-id": hdr(req, "x-user-id") || hdr(req, "x-admin-user-id"),
      "x-admin-user-id": hdr(req, "x-admin-user-id") || hdr(req, "x-user-id"),
    },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as ApiResp<T> | null;
  if (json) return json;
  return {
    ok: false,
    error: { code: "BAD_UPSTREAM", message: "Upstream returned invalid JSON." },
    traceId: "unknown",
  };
}

async function fetchLogo(req: NextRequest): Promise<Buffer | null> {
  try {
    const url = new URL("/api/admin/v1/tenants/current/logo", req.url);
    const cookie = req.headers.get("cookie") ?? "";
    const res = await fetch(url, {
      method: "GET",
      headers: {
        cookie,
        "x-mw-internal": "1",
        "x-tenant-slug": hdr(req, "x-tenant-slug"),
        "x-tenant-id": hdr(req, "x-tenant-id"),
        "x-user-id": hdr(req, "x-user-id") || hdr(req, "x-admin-user-id"),
        "x-admin-user-id": hdr(req, "x-admin-user-id") || hdr(req, "x-user-id"),
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

function flattenFields(values: unknown): Array<{ label: string; value: string }> {
  if (!values) return [];
  if (typeof values === "string") return [{ label: "Werte", value: values }];
  if (Array.isArray(values)) {
    return values.map((v, i) => ({ label: `Feld ${i + 1}`, value: typeof v === "string" ? v : JSON.stringify(v) }));
  }
  if (typeof values === "object") {
    const rec = values as Record<string, unknown>;
    const out: Array<{ label: string; value: string }> = [];
    for (const [k, v] of Object.entries(rec)) {
      const val =
        typeof v === "string"
          ? v
          : v == null
            ? ""
            : typeof v === "number" || typeof v === "boolean"
              ? String(v)
              : JSON.stringify(v);
      out.push({ label: k, value: val });
    }
    return out;
  }
  return [{ label: "Werte", value: String(values) }];
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildMailText(args: {
  lead: any;
  includeValues: boolean;
  message?: string;
}): string {
  const d = args.lead;
  const lines: string[] = [];

  if (args.message && args.message.trim()) {
    lines.push(args.message.trim(), "", "—", "");
  }

  lines.push("LeadRadar – Lead Weiterleitung", "");
  lines.push(`Event: ${d?.event?.name ?? "—"}`);
  lines.push(`Formular: ${d?.form?.name ?? "—"}`);
  lines.push(`Kontakt: ${d?.contact?.name ?? "—"}`);
  lines.push(`Firma: ${d?.contact?.company ?? "—"}`);
  lines.push(`E-Mail: ${d?.contact?.email ?? "—"}`);
  lines.push(`Telefon: ${d?.contact?.phoneRaw ?? d?.contact?.phone ?? "—"}`);
  lines.push(`Mobile: ${d?.contact?.mobile ?? "—"}`);
  lines.push(`Erfasst: ${d?.capturedAt ?? d?.createdAt ?? "—"}`);
  lines.push(`Lead-ID: ${d?.id ?? "—"}`);

  if (args.includeValues) {
    lines.push("", "Formularfelder:", "");
    const fields = flattenFields(d?.values);
    if (fields.length === 0) {
      lines.push("—");
    } else {
      for (const f of fields) lines.push(`${f.label}: ${f.value || "—"}`);
    }
  }

  return lines.join("\n");
}

function buildMailHtml(args: {
  lead: any;
  includeValues: boolean;
  message?: string;
}): string {
  const d = args.lead;

  const rows: Array<[string, string]> = [
    ["Event", d?.event?.name ?? "—"],
    ["Formular", d?.form?.name ?? "—"],
    ["Kontakt", d?.contact?.name ?? "—"],
    ["Firma", d?.contact?.company ?? "—"],
    ["E-Mail", d?.contact?.email ?? "—"],
    ["Telefon", d?.contact?.phoneRaw ?? d?.contact?.phone ?? "—"],
    ["Mobile", d?.contact?.mobile ?? "—"],
    ["Erfasst", d?.capturedAt ?? d?.createdAt ?? "—"],
    ["Lead-ID", d?.id ?? "—"],
  ];

  const values = args.includeValues ? flattenFields(d?.values) : [];

  const msgBlock = args.message && args.message.trim()
    ? `<p style="margin:0 0 12px 0; white-space:pre-wrap;">${escapeHtml(args.message.trim())}</p><hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;" />`
    : "";

  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;width:140px;">${escapeHtml(
          k
        )}</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(String(v ?? "—"))}</td></tr>`
    )
    .join("");

  const valuesHtml = args.includeValues
    ? `<h3 style="margin:16px 0 8px 0;font-size:14px;">Formularfelder</h3>${
        values.length === 0
          ? `<div style="color:#6b7280;">—</div>`
          : `<table style="border-collapse:collapse;width:100%;">${values
              .map(
                (f) =>
                  `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;width:220px;">${escapeHtml(
                    f.label
                  )}</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(f.value || "—")}</td></tr>`
              )
              .join("")}</table>`
      }`
    : "";

  return `<!doctype html>
<html>
  <body style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; color:#111827; line-height:1.4;">
    ${msgBlock}
    <h2 style="margin:0 0 10px 0;font-size:16px;">LeadRadar – Lead Weiterleitung</h2>
    <table style="border-collapse:collapse;width:100%; margin-bottom:10px;">${table}</table>
    ${valuesHtml}
  </body>
</html>`;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const traceId = crypto.randomUUID();
  const { id } = await ctx.params;

  const tenantSlug = hdr(req, "x-tenant-slug");
  if (!tenantSlug) {
    return NextResponse.json(
      { ok: false, error: { code: "TENANT_REQUIRED", message: "Tenant context required (x-tenant-slug header).", details: { traceId } }, traceId },
      { status: 401, headers: { "x-trace-id": traceId } }
    );
  }

  const userId = hdr(req, "x-user-id") || hdr(req, "x-admin-user-id");
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Missing x-user-id.", details: { traceId } }, traceId },
      { status: 401, headers: { "x-trace-id": traceId } }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_REQUEST", message: "Ungültige Anfrage.", details: { traceId } }, traceId },
      { status: 400, headers: { "x-trace-id": traceId } }
    );
  }

  // Load lead detail
  const leadResp = await fetchJson<any>(req, `/api/admin/v1/leads/${id}`);
  if (!leadResp.ok) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "Not found.", details: { traceId } }, traceId },
      { status: 404, headers: { "x-trace-id": traceId } }
    );
  }

  const lead = leadResp.data;

  const to = parsed.data.to.trim();
  const subject =
    (parsed.data.subject ?? "").trim() ||
    `Lead: ${lead?.contact?.name ?? lead?.contact?.company ?? lead?.id ?? id}`;

  const text = buildMailText({ lead, includeValues: parsed.data.includeValues, message: parsed.data.message });
  const html = buildMailHtml({ lead, includeValues: parsed.data.includeValues, message: parsed.data.message });

  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];

  if (parsed.data.includePdf) {
    const payload: LeadPdfPayload = {
      tenantSlug,
      tenantName: null,
      eventName: lead?.event?.name ?? null,
      formName: lead?.form?.name ?? null,
      leadId: String(lead?.id ?? id),
      capturedAt: lead?.capturedAt ?? null,
      createdAt: lead?.createdAt ?? null,
      contactName: lead?.contact?.name ?? null,
      company: lead?.contact?.company ?? null,
      email: lead?.contact?.email ?? null,
      phone: lead?.contact?.phoneRaw ?? lead?.contact?.phone ?? null,
      mobile: lead?.contact?.mobile ?? null,
      notes: lead?.adminNotes ?? null,
      fields: flattenFields(lead?.values),
    };

    const logo = await fetchLogo(req);
    const pdfU8 = await renderLeadPdf({ payload, logoPng: logo });
    const pdfBuf = Buffer.from(toArrayBuffer(pdfU8));
    const filename = buildLeadPdfFileName(payload);

    attachments.push({
      filename,
      content: pdfBuf,
      contentType: "application/pdf",
    });
  }

  try {
    const result = await sendMail({
      to,
      subject,
      html,
      text,
      attachments,
    });

    return NextResponse.json(
      { ok: true, data: result, traceId },
      { status: 200, headers: { "x-trace-id": traceId } }
    );
  } catch (e) {
    const msg = e instanceof Error && e.message === "SMTP_NOT_CONFIGURED"
      ? "E-Mail Service ist nicht konfiguriert."
      : "Konnte E-Mail nicht senden.";

    return NextResponse.json(
      { ok: false, error: { code: "EMAIL_SEND_FAILED", message: msg, details: { traceId } }, traceId },
      { status: 500, headers: { "x-trace-id": traceId } }
    );
  }
}
