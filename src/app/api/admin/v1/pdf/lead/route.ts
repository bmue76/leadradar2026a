import { NextRequest, NextResponse } from "next/server";
import { renderLeadPdf, type LeadPdfPayload } from "@/server/pdf/leadPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return copy.buffer;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const payload: LeadPdfPayload = {
    ...body,
    generatedAt: new Date().toISOString(),
  };

  const u8 = await renderLeadPdf(payload);
  const ab = toArrayBuffer(u8);

  return new NextResponse(ab, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "cache-control": "no-store",
    },
  });
}
