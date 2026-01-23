import { getApiBaseUrl } from "./env";
import { getApiKey } from "./auth";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiFetchArgs = {
  method: Method;
  path: string; // absolute URL OR /api/...
  apiKey?: string | null; // optional override
  body?: unknown; // object OR FormData OR string
};

export type ApiOk<T> = {
  ok: true;
  status: number;
  data: T;
  traceId?: string;
};

export type ApiErr = {
  ok: false;
  status: number; // 0 for network errors
  code: string;
  message: string;
  details?: unknown;
  traceId?: string;
};

export type ApiResult<T> = ApiOk<T> | ApiErr;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function safeParseJson(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return undefined;
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

function bodyToInit(body: unknown): { body?: BodyInit; contentType?: string } {
  if (body === undefined || body === null) return {};
  if (typeof FormData !== "undefined" && body instanceof FormData) return { body };
  if (typeof body === "string") return { body, contentType: "text/plain;charset=utf-8" };
  return { body: JSON.stringify(body), contentType: "application/json;charset=utf-8" };
}

/**
 * apiFetch (Mobile)
 * - attaches x-api-key automatically (stored key) unless args.apiKey is explicitly set
 * - normalizes jsonOk/jsonError envelopes into { ok, status, data|code/message, traceId }
 * - NEVER throws for HTTP errors (returns ok:false); only network/exception becomes ok:false status=0
 */
export async function apiFetch<T = unknown>(args: ApiFetchArgs): Promise<ApiResult<T>> {
  try {
    const baseUrl = getApiBaseUrl();
    const url = joinUrl(baseUrl, args.path);

    const stored = await getApiKey();
    const token = (args.apiKey ?? stored)?.trim() || "";

    const headers = new Headers();
    headers.set("Accept", "application/json");
    if (token) headers.set("x-api-key", token);

    const initBody = bodyToInit(args.body);
    if (initBody.contentType) headers.set("Content-Type", initBody.contentType);

    const res = await fetch(url, { method: args.method, headers, body: initBody.body });

    const headerTrace = res.headers.get("x-trace-id") || undefined;
    const json = await safeParseJson(res);

    const envelopeTrace =
      isRecord(json) && typeof json.traceId === "string" ? (json.traceId as string) : undefined;

    const traceId = envelopeTrace ?? headerTrace;

    if (isRecord(json) && json.ok === true && "data" in json) {
      return { ok: true, status: res.status, data: json.data as T, traceId };
    }

    if (isRecord(json) && json.ok === false && isRecord(json.error)) {
      const err = json.error as Record<string, unknown>;
      const code = typeof err.code === "string" ? err.code : `HTTP_${res.status}`;
      const message = typeof err.message === "string" ? err.message : `HTTP ${res.status}`;
      const details = "details" in err ? err.details : undefined;
      return { ok: false, status: res.status, code, message, details, traceId };
    }

    if (res.ok) {
      return { ok: true, status: res.status, data: (json as T) ?? (undefined as unknown as T), traceId };
    }

    return { ok: false, status: res.status, code: `HTTP_${res.status}`, message: `HTTP ${res.status}`, traceId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error.";
    return { ok: false, status: 0, code: "NETWORK", message: msg };
  }
}

/** ---- Helper exports expected by existing screens (Forms/Capture/OCR) ---- */

export type CreateLeadBody = {
  formId: string;
  clientLeadId: string;
  capturedAt: string; // ISO
  values: Record<string, unknown>;
};

export type CreateLeadResponse = {
  leadId: string;
  deduped?: boolean;
};

type LegacyCreateLeadArgs = { apiKey?: string | null; payload: CreateLeadBody };

export function createLead(body: CreateLeadBody, apiKey?: string | null): Promise<ApiResult<CreateLeadResponse>>;
export function createLead(args: LegacyCreateLeadArgs): Promise<ApiResult<CreateLeadResponse>>;
export async function createLead(
  a: CreateLeadBody | LegacyCreateLeadArgs,
  apiKey?: string | null,
): Promise<ApiResult<CreateLeadResponse>> {
  const payload = "payload" in a ? a.payload : a;
  const key = "payload" in a ? (a.apiKey ?? null) : (apiKey ?? null);

  return apiFetch<CreateLeadResponse>({
    method: "POST",
    path: "/api/mobile/v1/leads",
    apiKey: key,
    body: payload,
  });
}

export type UploadLeadAttachmentResponse = { attachmentId: string };
type LegacyUploadLeadAttachmentArgs = { apiKey?: string | null; leadId: string; payload: FormData };

export function uploadLeadAttachment(
  leadId: string,
  formData: FormData,
  apiKey?: string | null,
): Promise<ApiResult<UploadLeadAttachmentResponse>>;
export function uploadLeadAttachment(args: LegacyUploadLeadAttachmentArgs): Promise<ApiResult<UploadLeadAttachmentResponse>>;
export async function uploadLeadAttachment(
  a: string | LegacyUploadLeadAttachmentArgs,
  b?: FormData,
  c?: string | null,
): Promise<ApiResult<UploadLeadAttachmentResponse>> {
  const leadId = typeof a === "string" ? a : a.leadId;
  const formData = typeof a === "string" ? (b as FormData) : a.payload;
  const key = typeof a === "string" ? (c ?? null) : (a.apiKey ?? null);

  return apiFetch<UploadLeadAttachmentResponse>({
    method: "POST",
    path: `/api/mobile/v1/leads/${encodeURIComponent(leadId)}/attachments`,
    apiKey: key,
    body: formData,
  });
}

export type StoreAttachmentOcrBody = {
  engine: string;
  engineVersion?: string;
  mode: string;
  resultHash: string;
  rawText: string;
  blocksJson?: unknown | null;
  suggestions?: Record<string, unknown> | null;
};

export type StoreAttachmentOcrResponse = { ocrResultId: string };

type LegacyStoreAttachmentOcrArgs = { apiKey?: string | null; attachmentId: string; payload: StoreAttachmentOcrBody };

export function storeAttachmentOcrResult(
  attachmentId: string,
  payload: StoreAttachmentOcrBody,
  apiKey?: string | null,
): Promise<ApiResult<StoreAttachmentOcrResponse>>;
export function storeAttachmentOcrResult(args: LegacyStoreAttachmentOcrArgs): Promise<ApiResult<StoreAttachmentOcrResponse>>;
export async function storeAttachmentOcrResult(
  a: string | LegacyStoreAttachmentOcrArgs,
  b?: StoreAttachmentOcrBody,
  c?: string | null,
): Promise<ApiResult<StoreAttachmentOcrResponse>> {
  const attachmentId = typeof a === "string" ? a : a.attachmentId;
  const payload = typeof a === "string" ? (b as StoreAttachmentOcrBody) : a.payload;
  const key = typeof a === "string" ? (c ?? null) : (a.apiKey ?? null);

  return apiFetch<StoreAttachmentOcrResponse>({
    method: "POST",
    path: `/api/mobile/v1/attachments/${encodeURIComponent(attachmentId)}/ocr`,
    apiKey: key,
    body: payload,
  });
}

export type PatchLeadContactResponse = { updated: true } | Record<string, unknown>;
type LegacyPatchLeadContactArgs = { apiKey?: string | null; leadId: string; payload: Record<string, unknown> };

export function patchLeadContact(
  leadId: string,
  body: Record<string, unknown>,
  apiKey?: string | null,
): Promise<ApiResult<PatchLeadContactResponse>>;
export function patchLeadContact(args: LegacyPatchLeadContactArgs): Promise<ApiResult<PatchLeadContactResponse>>;
export async function patchLeadContact(
  a: string | LegacyPatchLeadContactArgs,
  b?: Record<string, unknown>,
  c?: string | null,
): Promise<ApiResult<PatchLeadContactResponse>> {
  const leadId = typeof a === "string" ? a : a.leadId;
  const payload = typeof a === "string" ? (b as Record<string, unknown>) : a.payload;
  const key = typeof a === "string" ? (c ?? null) : (a.apiKey ?? null);

  return apiFetch<PatchLeadContactResponse>({
    method: "PATCH",
    path: `/api/mobile/v1/leads/${encodeURIComponent(leadId)}/contact`,
    apiKey: key,
    body: payload,
  });
}
