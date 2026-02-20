import { NextRequest, NextResponse } from "next/server";
import { renderLeadPdf, type LeadPdfPayload, buildLeadPdfFileName } from "@/server/pdf/leadPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return copy.buffer;
}

function hdr(req: NextRequest, name: string): string {
  return (req.headers.get(name) ?? "").trim();
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

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();

  const raw = (await req.json().catch(() => null)) as unknown;
  const payload: LeadPdfPayload | null =
    raw && typeof raw === "object" && raw !== null && "payload" in raw
      ? ((raw as { payload?: unknown }).payload as LeadPdfPayload)
      : (raw as LeadPdfPayload);

  if (!payload || typeof payload !== "object") {
    return NextResponse.json(
      { ok: false, error: { code: "BAD_REQUEST", message: "Invalid payload.", details: { traceId } }, traceId },
      { status: 400, headers: { "x-trace-id": traceId } }
    );
  }

  const logo = await fetchLogo(req);
  const u8 = await renderLeadPdf({ payload, logoPng: logo });
  const ab = toArrayBuffer(u8);

  const filename = buildLeadPdfFileName(payload);

  return new NextResponse(ab, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-trace-id": traceId,
    },
  });
}
