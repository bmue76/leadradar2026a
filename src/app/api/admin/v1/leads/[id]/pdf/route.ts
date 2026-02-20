import { NextRequest, NextResponse } from "next/server";
import { buildLeadPdfFileName, renderLeadPdf, type LeadPdfPayload } from "@/server/pdf/leadPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnyRecord = Record<string, unknown>;
function isRecord(v: unknown): v is AnyRecord {
  return typeof v === "object" && v !== null;
}
function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function get(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (!isRecord(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}
function getStr(obj: unknown, path: string[]): string | null {
  return pickString(get(obj, path));
}

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return copy.buffer;
}

function hdr(req: NextRequest, name: string): string {
  return (req.headers.get(name) ?? "").trim();
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
  return { ok: false, error: { code: "BAD_UPSTREAM", message: "Upstream invalid JSON." }, traceId: "unknown" };
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
    return values.map((v, i) => ({
      label: `Feld ${i + 1}`,
      value: typeof v === "string" ? v : v == null ? "" : JSON.stringify(v),
    }));
  }
  if (isRecord(values)) {
    const out: Array<{ label: string; value: string }> = [];
    for (const [k, v] of Object.entries(values)) {
      const val =
        typeof v === "string" ? v : v == null ? "" : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
      out.push({ label: k, value: val });
    }
    return out;
  }
  return [{ label: "Werte", value: String(values) }];
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const tenantSlug = hdr(req, "x-tenant-slug");
  const traceId = crypto.randomUUID();
  if (!tenantSlug) {
    return NextResponse.json(
      { ok: false, error: { code: "TENANT_REQUIRED", message: "Tenant context required (x-tenant-slug header).", details: { traceId } }, traceId },
      { status: 401, headers: { "x-trace-id": traceId } }
    );
  }

  const url = new URL(req.url);
  const disposition = (url.searchParams.get("disposition") ?? "inline").trim();

  const leadResp = await fetchJson<unknown>(req, `/api/admin/v1/leads/${id}`);
  if (!leadResp.ok) {
    return NextResponse.json(leadResp, { status: 404, headers: { "x-trace-id": traceId } });
  }

  const lead = leadResp.data;

  const payload: LeadPdfPayload = {
    tenantSlug,
    tenantName: null,
    eventName: getStr(lead, ["event", "name"]),
    formName: getStr(lead, ["form", "name"]),
    leadId: String(getStr(lead, ["id"]) ?? id),
    capturedAt: getStr(lead, ["capturedAt"]),
    createdAt: getStr(lead, ["createdAt"]),
    contactName: getStr(lead, ["contact", "name"]),
    company: getStr(lead, ["contact", "company"]),
    email: getStr(lead, ["contact", "email"]),
    phone: getStr(lead, ["contact", "phoneRaw"]) ?? getStr(lead, ["contact", "phone"]),
    mobile: getStr(lead, ["contact", "mobile"]),
    notes: getStr(lead, ["adminNotes"]),
    fields: flattenFields(get(lead, ["values"])),
  };

  const logo = await fetchLogo(req);
  const u8 = await renderLeadPdf({ payload, logoPng: logo });
  const ab = toArrayBuffer(u8);

  const filename = buildLeadPdfFileName(payload);

  return new NextResponse(ab, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${disposition}; filename="${filename}"`,
      "cache-control": "no-store",
      "x-trace-id": traceId,
    },
  });
}
