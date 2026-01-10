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

  let body: string | undefined;
  if (args.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(args.body);
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
        code = toStr(err.code) || code;
        message = toStr(err.message) || message;
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
