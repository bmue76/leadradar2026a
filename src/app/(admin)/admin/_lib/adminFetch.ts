export const TENANT_SLUG_STORAGE_KEY = "lr_admin_tenant_slug";
export const DEV_USER_ID_STORAGE_KEY = "lr_admin_user_id";

export type ApiErrorShape = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiOkShape<T> = {
  ok: true;
  data: T;
  traceId: string;
};

export type ApiErrShape = {
  ok: false;
  error: ApiErrorShape;
  traceId: string;
};

function sanitizeTenantSlug(input: string): string {
  return input.trim().toLowerCase();
}

function pickTraceId(res: Response, parsed: unknown): string {
  const h = res.headers.get("x-trace-id");
  if (h && h.trim()) return h.trim();
  if (parsed && typeof parsed === "object" && parsed !== null && "traceId" in parsed) {
    const t = (parsed as { traceId?: unknown }).traceId;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  return "";
}

async function safeParseJson(text: string): Promise<unknown | undefined> {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Admin fetch helper (hardened).
 *
 * Default behaviour:
 * - NO tenant header required (session is source of truth)
 *
 * Optional DEV override:
 * - pass init.tenantSlug explicitly to send x-tenant-slug
 *
 * Response:
 * - always returns { ok:true,data,traceId } or { ok:false,error:{code,message,details?},traceId }
 */
export async function adminFetchJson<T>(
  path: string,
  init?: RequestInit & { tenantSlug?: string }
): Promise<ApiOkShape<T> | ApiErrShape> {
  const headers = new Headers(init?.headers || {});
  headers.set("accept", "application/json");

  const explicitTenantSlug = typeof init?.tenantSlug === "string" ? sanitizeTenantSlug(init.tenantSlug) : "";
  if (explicitTenantSlug) {
    headers.set("x-tenant-slug", explicitTenantSlug);
  }

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers,
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: "Netzwerkfehler. Läuft der Server (npm run dev)?" },
      traceId: "",
    };
  }

  const text = await res.text();
  const parsed = await safeParseJson(text);
  const traceId = pickTraceId(res, parsed);

  // Standard API response shape
  if (parsed && typeof parsed === "object" && parsed !== null && "ok" in parsed) {
    const okVal = (parsed as { ok?: unknown }).ok;
    if (okVal === true) {
      const data = (parsed as ApiOkShape<T>).data;
      const t = (parsed as ApiOkShape<T>).traceId;
      return { ok: true, data, traceId: (t && t.trim()) ? t : traceId };
    }
    if (okVal === false) {
      const err = (parsed as ApiErrShape).error;
      const t = (parsed as ApiErrShape).traceId;
      return {
        ok: false,
        error: {
          code: err?.code ?? "API_ERROR",
          message: err?.message ?? "Request failed.",
          details: err?.details,
        },
        traceId: (t && t.trim()) ? t : traceId,
      };
    }
  }

  // Non-standard response fallback
  if (!res.ok) {
    return {
      ok: false,
      error: { code: "HTTP_ERROR", message: `Request failed (${res.status}).` },
      traceId,
    };
  }

  return {
    ok: false,
    error: { code: "BAD_RESPONSE", message: "Antwort war nicht im erwarteten JSON-Format (ok:true/false)." },
    traceId,
  };
}
