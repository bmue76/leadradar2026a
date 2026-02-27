import { getApiKey } from "./auth";
import { getAppSettings } from "./appSettings";

/**
 * Standard contract (Backend):
 * { ok: true, data: ..., traceId }
 * { ok: false, error: { code, message, details }, traceId }
 */
export type ApiOk<T> = { ok: true; data: T; traceId?: string };
export type ApiErr = {
  ok: false;
  status?: number;
  code?: string;
  message: string;
  details?: unknown;
  traceId?: string;
};
export type ApiResult<T> = ApiOk<T> | ApiErr;

export type ApiFetchArgs = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string; // absolute or relative
  body?: unknown;
  headers?: Record<string, string>;
  apiKey?: string | null; // optional override (default: from storage)
  timeoutMs?: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v : null;
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

function networkHint(url: string) {
  if (url.includes("localhost") || url.includes("127.0.0.1")) {
    return "Base URL zeigt auf localhost. Android erreicht das nicht. Nutze z.B. http://<LAN-IP>:3000";
  }
  return "Host/Netz/Firewall prüfen. Teste die Base URL im Android-Browser.";
}

async function readTextSafe(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function parseJsonFromText(text: string): unknown {
  const t = (text ?? "").trim();
  if (!t) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return { raw: t };
  }
}

function pickTraceId(res: Response, payload: unknown): string | undefined {
  const hdr = res.headers.get("x-trace-id") || undefined;
  if (hdr) return hdr;
  return isRecord(payload) ? (pickString(payload.traceId) ?? undefined) : undefined;
}

function toApiErr(res: Response, payload: unknown): ApiErr {
  const traceId = pickTraceId(res, payload);

  if (isRecord(payload) && payload.ok === false) {
    const errObj = isRecord(payload.error) ? payload.error : null;
    return {
      ok: false,
      status: res.status,
      code: errObj ? pickString(errObj.code) ?? undefined : undefined,
      message: errObj ? pickString(errObj.message) ?? `HTTP ${res.status}` : `HTTP ${res.status}`,
      details: errObj ? (errObj.details ?? undefined) : undefined,
      traceId,
    };
  }

  return { ok: false, status: res.status, message: `HTTP ${res.status}`, traceId };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Generic fetch helper (Mobile).
 * - Injects x-tenant-slug from Settings (required for /api/* relative paths)
 * - Injects x-api-key / Authorization (optional)
 * - Timeout + robust JSON parsing
 * - Extracts traceId from body + x-trace-id
 */
export function apiFetch<T = unknown>(path: string): Promise<ApiResult<T>>;
export function apiFetch<T = unknown>(args: ApiFetchArgs): Promise<ApiResult<T>>;
export async function apiFetch<T = unknown>(arg: string | ApiFetchArgs): Promise<ApiResult<T>> {
  const args: ApiFetchArgs = typeof arg === "string" ? { path: arg } : arg;

  const method = args.method ?? "GET";
  const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 10_000;

  const settings = await getAppSettings();
  const needsBaseUrl = !/^https?:\/\//i.test(args.path);
  const base = settings.effectiveBaseUrl;

  if (needsBaseUrl && !base) {
    return {
      ok: false,
      status: 0,
      code: "BASE_URL_REQUIRED",
      message: "Base URL fehlt. Bitte in den Einstellungen setzen.",
      details: { action: "open_settings" },
    };
  }

  const url = needsBaseUrl ? joinUrl(base as string, args.path) : args.path;

  // Enforce tenant header for first-party API calls (relative /api/*)
  const isFirstPartyApi = needsBaseUrl && (args.path.startsWith("/api/") || args.path.startsWith("api/"));
  const tenantSlugFromSettings = settings.tenantSlug;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(args.headers ?? {}),
  };

  if (isFirstPartyApi) {
    const existingTenant = headers["x-tenant-slug"]?.trim() || "";
    const tenant = existingTenant || (tenantSlugFromSettings ?? "");
    if (!tenant) {
      return {
        ok: false,
        status: 0,
        code: "TENANT_REQUIRED",
        message: "Tenant fehlt. Bitte in den Einstellungen setzen.",
        details: { header: "x-tenant-slug", action: "open_settings" },
      };
    }
    headers["x-tenant-slug"] = tenant;
  } else if (tenantSlugFromSettings && !headers["x-tenant-slug"]) {
    // Best-effort for non-first-party URLs
    headers["x-tenant-slug"] = tenantSlugFromSettings;
  }

  const key = args.apiKey === undefined ? await getApiKey() : args.apiKey;
  if (key && key.trim()) {
    headers["x-api-key"] = key.trim();
    headers["authorization"] = `Bearer ${key.trim()}`;
  }

  let body: BodyInit | undefined = undefined;

  // Allow multipart/form-data (FormData)
  if (typeof FormData !== "undefined" && args.body instanceof FormData) {
    body = args.body;
  } else if (args.body !== undefined && args.body !== null && method !== "GET") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(args.body);
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(url, { method, headers, body }, timeoutMs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error.";
    const code = msg.toLowerCase().includes("abort") ? "TIMEOUT" : "NETWORK_ERROR";
    return {
      ok: false,
      status: 0,
      code,
      message: code === "TIMEOUT" ? "Zeitüberschreitung (Timeout)." : "Keine Verbindung möglich.",
      details: { url, hint: networkHint(url), rawError: msg },
    };
  }

  const text = await readTextSafe(res);
  const payload = parseJsonFromText(text);
  const traceId = pickTraceId(res, payload);

  if (!res.ok) return toApiErr(res, payload);

  // Prefer server response shape (ok/data), but accept plain JSON too.
  if (isRecord(payload) && payload.ok === true && "data" in payload) {
    return { ok: true, data: (payload.data as T), traceId: pickString(payload.traceId) ?? traceId };
  }

  return { ok: true, data: (payload as T), traceId };
}

/* ---------------------------
   Typed convenience wrappers
----------------------------*/

export type CreateLeadBody = {
  formId: string;
  clientLeadId: string;
  capturedAt: string; // ISO
  values: Record<string, unknown>;
  eventId?: string | null;
};

export type CreateLeadData = { leadId: string; deduped?: boolean };

export async function createLead(args: { apiKey: string; payload: CreateLeadBody }): Promise<ApiResult<CreateLeadData>> {
  const res = await apiFetch<unknown>({
    method: "POST",
    path: "/api/mobile/v1/leads",
    apiKey: args.apiKey,
    body: args.payload,
  });

  if (!res.ok) return res;

  const data = res.data;
  if (!isRecord(data)) {
    return { ok: false, message: "Invalid API response shape (createLead)." };
  }

  const leadId = pickString(data.leadId) ?? pickString(data.id);
  if (!leadId) return { ok: false, message: "Invalid API response shape (missing leadId)." };

  const deduped = typeof data.deduped === "boolean" ? data.deduped : undefined;

  return { ok: true, data: { leadId, deduped }, traceId: (res as ApiOk<unknown>).traceId };
}

export type LegacyUploadLeadAttachmentArgs = {
  apiKey: string;
  leadId: string;
  fileUri: string;
  mimeType: string;
  fileName: string;
  type?: "BUSINESS_CARD_IMAGE" | "IMAGE" | "PDF" | "OTHER";
};

export type UploadLeadAttachmentData = { attachmentId: string };

export async function uploadLeadAttachment(args: LegacyUploadLeadAttachmentArgs): Promise<ApiResult<UploadLeadAttachmentData>> {
  const fd = new FormData();
  // RN file part:
  fd.append("file", { uri: args.fileUri, name: args.fileName, type: args.mimeType } as unknown as Blob);
  if (args.type) fd.append("type", args.type);

  const res = await apiFetch<unknown>({
    method: "POST",
    path: `/api/mobile/v1/leads/${encodeURIComponent(args.leadId)}/attachments`,
    apiKey: args.apiKey,
    body: fd,
    timeoutMs: 30_000,
  });

  if (!res.ok) return res;

  const data = res.data;
  if (!isRecord(data)) return { ok: false, message: "Invalid API response shape (uploadLeadAttachment)." };

  // backend currently returns { id: ... } — keep mobile contract { attachmentId }
  const attachmentId = pickString(data.attachmentId) ?? pickString(data.id);
  if (!attachmentId) return { ok: false, message: "Invalid API response shape (missing attachmentId)." };

  return { ok: true, data: { attachmentId }, traceId: (res as ApiOk<unknown>).traceId };
}

export type StoreAttachmentOcrBody = {
  engine: string;
  engineVersion: string;
  mode: string;
  resultHash: string;
  rawText: string;
  blocksJson: unknown | null;
  suggestions: Record<string, unknown>;
};

export type StoreAttachmentOcrData = { ocrResultId: string };

export async function storeAttachmentOcrResult(args: {
  apiKey: string;
  attachmentId: string;
  payload: StoreAttachmentOcrBody;
}): Promise<ApiResult<StoreAttachmentOcrData>> {
  const res = await apiFetch<unknown>({
    method: "POST",
    path: `/api/mobile/v1/attachments/${encodeURIComponent(args.attachmentId)}/ocr`,
    apiKey: args.apiKey,
    body: args.payload,
  });

  if (!res.ok) return res;

  const data = res.data;
  if (!isRecord(data)) return { ok: false, message: "Invalid API response shape (storeAttachmentOcrResult)." };

  const ocrResultId = pickString(data.ocrResultId) ?? pickString(data.id);
  if (!ocrResultId) return { ok: false, message: "Invalid API response shape (missing ocrResultId)." };

  return { ok: true, data: { ocrResultId }, traceId: (res as ApiOk<unknown>).traceId };
}

export async function patchLeadContact(args: {
  apiKey: string;
  leadId: string;
  payload: Record<string, unknown>;
}): Promise<ApiResult<Record<string, unknown>>> {
  return await apiFetch<Record<string, unknown>>({
    method: "PATCH",
    path: `/api/mobile/v1/leads/${encodeURIComponent(args.leadId)}/contact`,
    apiKey: args.apiKey,
    body: args.payload,
  });
}
