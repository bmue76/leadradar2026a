import { getApiBaseUrl } from "./env";

type JsonObject = Record<string, unknown>;

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

function toStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export type ApiResult<T> =
  | { ok: true; status: number; data: T; traceId?: string; headers?: Record<string, string> }
  | { ok: false; status: number; code: string; message: string; traceId?: string; headers?: Record<string, string> };

function getTraceIdFromHeaders(h: Headers): string | undefined {
  return h.get("x-trace-id") || h.get("X-Trace-Id") || undefined;
}

function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function safeJsonParse(text: string): unknown {
  const t = text.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null;
  }
}

function isFormDataBody(v: unknown): v is FormData {
  // RN provides global FormData
  return typeof FormData !== "undefined" && v instanceof FormData;
}

function mapError<T>(r: ApiResult<unknown>): ApiResult<T> {
  if (r.ok) {
    return { ok: true, status: r.status, data: r.data as T, traceId: r.traceId, headers: r.headers };
  }
  return { ok: false, status: r.status, code: r.code, message: r.message, traceId: r.traceId, headers: r.headers };
}

function badResponse<T>(message: string, traceId?: string, headers?: Record<string, string>): ApiResult<T> {
  return { ok: false, status: 500, code: "BAD_RESPONSE", message, traceId, headers };
}

function extractId(payload: unknown, keys: string[]): string | null {
  if (!payload) return null;

  if (typeof payload === "string" && payload.trim()) return payload.trim();

  if (isObject(payload)) {
    for (const k of keys) {
      const v = (payload as JsonObject)[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }

    // nested variants
    for (const k of keys) {
      const obj = (payload as JsonObject)[k];
      if (isObject(obj)) {
        const v = (obj as JsonObject).id;
        if (typeof v === "string" && v.trim()) return v.trim();
      }
    }

    const data = (payload as JsonObject).data;
    if (isObject(data)) return extractId(data, keys);
  }

  return null;
}

export async function apiFetch<T>(args: {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  apiKey?: string | null;
  body?: unknown;
}): Promise<ApiResult<T>> {
  const base = getApiBaseUrl();
  const url = `${base}${args.path.startsWith("/") ? "" : "/"}${args.path}`;

  const headers: Record<string, string> = { accept: "application/json" };
  if (args.apiKey) headers["x-api-key"] = args.apiKey;

  let body: FormData | string | undefined = undefined;

  if (args.body !== undefined) {
    if (isFormDataBody(args.body)) {
      body = args.body;
      // IMPORTANT: do NOT set content-type here; fetch will add boundary
    } else {
      headers["content-type"] = "application/json";
      body = JSON.stringify(args.body);
    }
  }

  try {
    const res = await fetch(url, { method: args.method, headers, body });

    const traceIdH = getTraceIdFromHeaders(res.headers);
    const headersObj = headersToObject(res.headers);

    const text = await res.text();
    const json = safeJsonParse(text);

    if (res.ok) {
      // backend: { ok:true, data: <payload>, traceId }
      if (isObject(json) && "data" in json) {
        const traceId = toStr((json as JsonObject).traceId) || traceIdH;
        return { ok: true, status: res.status, data: (json as JsonObject).data as T, traceId, headers: headersObj };
      }
      return { ok: true, status: res.status, data: json as T, traceId: traceIdH, headers: headersObj };
    }

    let code = "HTTP_ERROR";
    let message = `HTTP ${res.status}`;
    let traceId = traceIdH;

    if (isObject(json)) {
      const t = toStr((json as JsonObject).traceId);
      if (t) traceId = t;

      const err = (json as JsonObject).error;
      if (isObject(err)) {
        code = toStr((err as JsonObject).code) || code;
        message = toStr((err as JsonObject).message) || message;
      } else {
        code = toStr((json as JsonObject).code) || code;
        message = toStr((json as JsonObject).message) || message;
      }
    }

    return { ok: false, status: res.status, code, message, traceId, headers: headersObj };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network request failed";
    return { ok: false, status: 0, code: "NETWORK_ERROR", message: msg };
  }
}

/**
 * POST /api/mobile/v1/leads
 * expected: { leadId } OR { id } OR { lead: { id } } OR wrapped {data:{...}}
 */
export async function createLead(args: {
  apiKey: string;
  payload: {
    clientLeadId: string;
    formId: string;
    capturedAt: string;
    values: unknown;
  };
}): Promise<ApiResult<{ leadId: string }>> {
  const res = await apiFetch<unknown>({
    method: "POST",
    path: "/api/mobile/v1/leads",
    apiKey: args.apiKey,
    body: args.payload,
  });

  if (!res.ok) return mapError(res);

  const leadId = extractId(res.data, ["leadId", "id", "lead"]);
  if (!leadId) return badResponse("createLead: leadId fehlt in Response.", res.traceId, res.headers);

  return { ok: true, status: res.status, data: { leadId }, traceId: res.traceId, headers: res.headers };
}

/**
 * POST /api/mobile/v1/leads/:leadId/attachments (multipart/form-data)
 * expected: { attachmentId } OR { id } OR { attachment: { id } } OR wrapped {data:{...}}
 */
export async function uploadLeadAttachment(args: {
  apiKey: string;
  leadId: string;
  fileUri: string;
  mimeType: string;
  fileName: string;
}): Promise<ApiResult<{ attachmentId: string }>> {
  const leadId = (args.leadId || "").trim();
  if (!leadId) return badResponse("uploadLeadAttachment: leadId fehlt.");

  const fd = new FormData();
  // RN: file object must be cast to any
  fd.append("file", { uri: args.fileUri, name: args.fileName, type: args.mimeType } as unknown as Blob);
  fd.append("fileName", args.fileName);
  fd.append("mimeType", args.mimeType);

  const res = await apiFetch<unknown>({
    method: "POST",
    path: `/api/mobile/v1/leads/${encodeURIComponent(leadId)}/attachments`,
    apiKey: args.apiKey,
    body: fd,
  });

  if (!res.ok) return mapError(res);

  const attachmentId = extractId(res.data, ["attachmentId", "id", "attachment"]);
  if (!attachmentId) return badResponse("uploadLeadAttachment: attachmentId fehlt in Response.", res.traceId, res.headers);

  return { ok: true, status: res.status, data: { attachmentId }, traceId: res.traceId, headers: res.headers };
}

/**
 * POST /api/mobile/v1/attachments/:attachmentId/ocr
 * expected: { ocrResultId } OR { id } OR wrapped
 *
 * If your backend uses a different path, we also try a fallback.
 */
export async function storeAttachmentOcrResult(args: {
  apiKey: string;
  attachmentId: string;
  payload: {
    engine: string;
    engineVersion?: string;
    mode?: string;
    resultHash?: string;
    rawText: string;
    blocksJson?: unknown;
    suggestions?: unknown;
  };
}): Promise<ApiResult<{ ocrResultId: string }>> {
  const attachmentId = (args.attachmentId || "").trim();
  if (!attachmentId) return badResponse("storeAttachmentOcrResult: attachmentId fehlt.");

  const tryOnce = async (path: string) =>
    apiFetch<unknown>({
      method: "POST",
      path,
      apiKey: args.apiKey,
      body: args.payload,
    });

  let res = await tryOnce(`/api/mobile/v1/attachments/${encodeURIComponent(attachmentId)}/ocr`);

  // fallback for older route naming
  if (!res.ok && res.status === 404) {
    res = await tryOnce(`/api/mobile/v1/attachments/${encodeURIComponent(attachmentId)}/ocr-results`);
  }

  if (!res.ok) return mapError(res);

  const ocrResultId = extractId(res.data, ["ocrResultId", "id", "ocrResult"]);
  if (!ocrResultId) return badResponse("storeAttachmentOcrResult: ocrResultId fehlt in Response.", res.traceId, res.headers);

  return { ok: true, status: res.status, data: { ocrResultId }, traceId: res.traceId, headers: res.headers };
}

/**
 * PATCH /api/mobile/v1/leads/:leadId/contact
 * response can be ignored; we keep it as ok:true with payload.
 */
export async function patchLeadContact(args: {
  apiKey: string;
  leadId: string;
  payload: Record<string, unknown>;
}): Promise<ApiResult<{ ok: true }>> {
  const leadId = (args.leadId || "").trim();
  if (!leadId) return badResponse("patchLeadContact: leadId fehlt.");

  const res = await apiFetch<unknown>({
    method: "PATCH",
    path: `/api/mobile/v1/leads/${encodeURIComponent(leadId)}/contact`,
    apiKey: args.apiKey,
    body: args.payload,
  });

  if (!res.ok) return mapError(res);

  return { ok: true, status: res.status, data: { ok: true }, traceId: res.traceId, headers: res.headers };
}
