import { NextRequest, NextResponse } from "next/server";
import { renderLeadPdf, type LeadPdfPayload } from "@/server/pdf/leadPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false, error: { code, message }, traceId: crypto.randomUUID() },
    { status }
  );
}

function safeFilename(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export async function POST(req: NextRequest) {
  // Minimaler Schutz (passt zu deinem Clerk-Removal / Header-Auth Stil)
  const userId = req.headers.get("x-user-id") || req.headers.get("x-admin-user-id");
  const tenantId = req.headers.get("x-tenant-id");

  if (!userId) return jsonError(401, "UNAUTHORIZED", "Missing x-user-id.");
  if (!tenantId) return jsonError(401, "UNAUTHORIZED", "Missing x-tenant-id.");

  let payload: LeadPdfPayload | null = null;
  try {
    payload = (await req.json()) as LeadPdfPayload;
  } catch {
    return jsonError(400, "BAD_REQUEST", "Invalid JSON body.");
  }

  if (!payload) return jsonError(400, "BAD_REQUEST", "Missing payload.");

  const buf = await renderLeadPdf(payload);

  const leadId = payload.leadId || "lead";
  const filename = safeFilename(`LeadRadar-Lead-${leadId}.pdf`);

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
