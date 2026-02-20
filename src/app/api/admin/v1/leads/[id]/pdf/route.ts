import { NextRequest, NextResponse } from "next/server";
import { renderLeadPdf, type LeadPdfPayload } from "@/server/pdf/leadPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return copy.buffer;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const url = new URL(req.url);
  const disposition = (url.searchParams.get("disposition") ?? "inline").trim();
  const filename = `lead-${id}.pdf`;

  const payload: LeadPdfPayload = {
    leadId: id,
    generatedAt: new Date().toISOString(),
  };

  const u8 = await renderLeadPdf(payload);
  const ab = toArrayBuffer(u8);

  return new NextResponse(ab, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${disposition}; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
