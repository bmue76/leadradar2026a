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

export type AdminApiResult<T> =
  | { ok: true; data: T; traceId: string; status: number }
  | { ok: false; code: string; message: string; traceId?: string; status?: number };

function getEnv(name: string): string {
  const v = process.env[name];
  return (v ?? "").trim();
}

export function getDefaultTenantSlug(): string {
  return getEnv("NEXT_PUBLIC_DEFAULT_TENANT_SLUG");
}

export function sanitizeTenantSlug(input: string): string {
  return input.trim().toLowerCase();
}

export function getTenantSlugClient(): string {
  if (typeof window === "undefined") return getDefaultTenantSlug();
  try {
    const stored = window.localStorage.getItem(TENANT_SLUG_STORAGE_KEY);
    if (stored && stored.trim()) return sanitizeTenantSlug(stored);
  } catch {
    // ignore
  }
  return getDefaultTenantSlug();
}

export function setTenantSlugClient(slug: string) {
  if (typeof window === "undefined") return;
  try {
    const s = sanitizeTenantSlug(slug);
    window.localStorage.setItem(TENANT_SLUG_STORAGE_KEY, s);
  } catch {
    // ignore
  }
}

export function getDevUserIdClient(): string {
  if (typeof window === "undefined") return getEnv("NEXT_PUBLIC_DEV_USER_ID");
  try {
    const stored = window.localStorage.getItem(DEV_USER_ID_STORAGE_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    // ignore
  }
  return getEnv("NEXT_PUBLIC_DEV_USER_ID");
}

export function setDevUserIdClient(userId: string) {
  if (typeof window === "undefined") return;
  try {
    const v = userId.trim();
    if (!v) window.localStorage.removeItem(DEV_USER_ID_STORAGE_KEY);
    else window.localStorage.setItem(DEV_USER_ID_STORAGE_KEY, v);
  } catch {
    // ignore
  }
}

function pickTraceId(res: Response, parsed: unknown): string | undefined {
  const h = res.headers.get("x-trace-id") || undefined;
  if (h) return h;
  if (parsed && typeof parsed === "object" && parsed !== null && "traceId" in parsed) {
    const t = (parsed as { traceId?: unknown }).traceId;
    return typeof t === "string" ? t : undefined;
  }
  return undefined;
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
 * Admin fetch wrapper (browser).
 * Default: session-based tenant (no x-tenant-slug required).
 * Optional DEV override: pass init.tenantSlug explicitly.
 */
export async function adminFetchJson<T>(
  path: string,
  init?: RequestInit & { tenantSlug?: string }
): Promise<AdminApiResult<T>> {
  const headers = new Headers(init?.headers || {});
  headers.set("accept", "application/json");

  // Optional tenant override (DEV helper) – only when explicitly provided.
  const tenantSlugRaw = typeof init?.tenantSlug === "string" ? init.tenantSlug : "";
  const tenantSlug = tenantSlugRaw.trim() ? sanitizeTenantSlug(tenantSlugRaw) : "";
  if (tenantSlug) headers.set("x-tenant-slug", tenantSlug);

  // Optional Dev-Header (nur lokal sinnvoll, falls Backend das erwartet)
  if (process.env.NODE_ENV !== "production") {
    const devUserId = getDevUserIdClient();
    if (devUserId) headers.set("x-user-id", devUserId);
  }

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers,
      cache: "no-store",
      credentials: "include",
    });
  } catch {
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: "Netzwerkfehler. Läuft der Server (npm run dev)?",
    };
  }

  const text = await res.text();
  const parsed = await safeParseJson(text);
  const traceId = pickTraceId(res, parsed);

  // Preferred: Standard API response shape
  if (parsed && typeof parsed === "object" && parsed !== null && "ok" in parsed) {
    const okVal = (parsed as { ok?: unknown }).ok;
    if (okVal === true) {
      const data = (parsed as ApiOkShape<T>).data;
      const t = (parsed as ApiOkShape<T>).traceId;
      return { ok: true, data, traceId: t || traceId || "", status: res.status };
    }
    if (okVal === false) {
      const err = (parsed as ApiErrShape).error;
      const t = (parsed as ApiErrShape).traceId;
      return {
        ok: false,
        code: err?.code ?? "API_ERROR",
        message: err?.message ?? "Request failed.",
        traceId: t || traceId,
        status: res.status,
      };
    }
  }

  // Fallback (non-standard response)
  if (!res.ok) {
    return {
      ok: false,
      code: "HTTP_ERROR",
      message: `Request failed (${res.status}).`,
      traceId,
      status: res.status,
    };
  }

  return {
    ok: false,
    code: "BAD_RESPONSE",
    message: "Antwort war nicht im erwarteten JSON-Format (ok:true/false).",
    traceId,
    status: res.status,
  };
}
