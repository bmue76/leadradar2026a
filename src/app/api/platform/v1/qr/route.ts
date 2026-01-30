import QRCode from "qrcode";
import { jsonError } from "@/lib/api";
import { isHttpError, httpError } from "@/lib/http";

export const runtime = "nodejs";

function clampInt(v: string | null, min: number, max: number, fallback: number): number {
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return Math.max(min, Math.min(max, i));
}

function decodePngDataUrlToBuffer(dataUrl: string): Buffer {
  const idx = dataUrl.indexOf(",");
  if (idx < 0) throw httpError(500, "INTERNAL", "Invalid QR data URL.");
  const base64 = dataUrl.slice(idx + 1);
  return Buffer.from(base64, "base64");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const text = (url.searchParams.get("text") ?? "").trim();

    if (!text) throw httpError(400, "INVALID_QUERY", "Missing query param: text");
    if (text.length > 1200) throw httpError(400, "INVALID_QUERY", "text too long");

    const size = clampInt(url.searchParams.get("size"), 120, 800, 320);
    const margin = clampInt(url.searchParams.get("margin"), 0, 8, 2);
    const scale = clampInt(url.searchParams.get("scale"), 2, 16, 6);

    const dataUrl = await QRCode.toDataURL(text, {
      errorCorrectionLevel: "M",
      margin,
      width: size,
      scale,
    });

    const buf = decodePngDataUrlToBuffer(dataUrl);

    // TS-safe: create a real ArrayBuffer copy (avoids Buffer<ArrayBufferLike> BlobPart issue)
    const ab = Uint8Array.from(buf).buffer;

    return new Response(ab, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
