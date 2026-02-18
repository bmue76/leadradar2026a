import { NextRequest, NextResponse } from "next/server";
import { renderLeadPdf, type LeadPdfPayload } from "@/server/pdf/leadPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(details ? { details } : {}) }, traceId: crypto.randomUUID() },
    { status }
  );
}

function safeFilename(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const userId = req.headers.get("x-user-id") || req.headers.get("x-admin-user-id");
  const tenantId = req.headers.get("x-tenant-id");

  if (!userId) return jsonError(401, "UNAUTHORIZED", "Missing x-user-id.");
  if (!tenantId) return jsonError(401, "UNAUTHORIZED", "Missing x-tenant-id.");

  const leadId = ctx.params.id;
  if (!leadId) return jsonError(400, "BAD_REQUEST", "Missing lead id.");

  // Lead-Detail via bestehende API laden (1 Source of Truth)
  const url = new URL(`/api/admin/v1/leads/${leadId}`, req.url);
  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "x-user-id": userId,
      "x-tenant-id": tenantId,
    },
  });

  let json: ApiResp<unknown> | null = null;
  try {
    json = (await res.json()) as ApiResp<unknown>;
  } catch {
    json = null;
  }

  if (!json || typeof json !== "object") {
    return jsonError(502, "UPSTREAM_INVALID", "Invalid lead detail response.");
  }

  if (!json.ok) {
    return jsonError(res.status || 500, json.error?.code || "UPSTREAM_ERROR", json.error?.message || "Could not load lead.", json.error?.details);
  }

  // Best-effort: Lead-Detail passt i.d.R. sehr gut als PDF-Payload
  const payload = (json.data as unknown) as LeadPdfPayload;

  const buf = await renderLeadPdf(payload);
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);

  const disposition = req.nextUrl.searchParams.get("disposition") === "inline" ? "inline" : "attachment";
  const filename = safeFilename(`LeadRadar-Lead-${leadId}.pdf`);

  return new NextResponse(u8, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
