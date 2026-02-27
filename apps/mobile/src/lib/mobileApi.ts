import { getAppSettings, normalizeTenantSlug } from "./appSettings";

export type JsonOk<T> = { ok: true; data: T; traceId: string };
export type JsonErr = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  traceId: string;
};

export type ProvisionRedeemResponse = {
  apiKey: string;
  tenantSlug: string;
  deviceId: string;
};

export type LicenseResponse = {
  isActive: boolean;
  endsAt: string | null;
  type: string | null;
};

export class ApiError extends Error {
  status: number;
  code: string;
  traceId?: string;
  details?: unknown;

  constructor(args: { status: number; code: string; message: string; traceId?: string; details?: unknown }) {
    super(args.message);
    this.status = args.status;
    this.code = args.code;
    this.traceId = args.traceId;
    this.details = args.details;
  }
}

function networkHint(url: string) {
  if (url.includes("localhost") || url.includes("127.0.0.1")) {
    return "Base URL zeigt auf localhost. Android erreicht das nicht. Nutze z.B. http://<LAN-IP>:3000";
  }
  return "Host/Netz/Firewall prüfen. Teste die Base URL im Android-Browser.";
}

async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text } as unknown;
  }
}

function pickTraceId(res: Response, body: unknown): string | undefined {
  const maybe = body as Record<string, unknown> | undefined;
  const tid = typeof maybe?.traceId === "string" ? maybe.traceId : undefined;
  return res.headers.get("x-trace-id") || tid || undefined;
}

async function resolveBaseUrl(): Promise<string> {
  const s = await getAppSettings();
  if (!s.effectiveBaseUrl) {
    throw new ApiError({
      status: 0,
      code: "BASE_URL_REQUIRED",
      message: "Base URL fehlt. Bitte in den Einstellungen setzen.",
      details: { action: "open_settings" },
    });
  }
  return s.effectiveBaseUrl;
}

async function fetchWithDiagnostics(url: string, init: RequestInit, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg.toLowerCase().includes("abort") ? "TIMEOUT" : "NETWORK_ERROR";
    throw new ApiError({
      status: 0,
      code,
      message: code === "TIMEOUT" ? "Zeitüberschreitung (Timeout)." : "Network request failed",
      details: { url, hint: networkHint(url), rawError: msg },
    });
  } finally {
    clearTimeout(t);
  }
}

export async function redeemProvisioning(tenantSlug: string, code: string): Promise<ProvisionRedeemResponse> {
  const baseUrl = await resolveBaseUrl();
  const url = `${baseUrl}/api/mobile/v1/provisioning/redeem`;

  const t = normalizeTenantSlug(tenantSlug);
  const c = (code || "").replace(/\s+/g, "").trim().toUpperCase();

  if (!t) {
    throw new ApiError({
      status: 0,
      code: "TENANT_REQUIRED",
      message: "Tenant ist ungültig. Bitte in den Einstellungen prüfen.",
      details: { field: "tenantSlug" },
    });
  }

  const res = await fetchWithDiagnostics(
    url,
    {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-tenant-slug": t,
      },
      body: JSON.stringify({ tenantSlug: t, code: c }),
    },
    12_000
  );

  const body = await readJsonSafe(res);
  const traceId = pickTraceId(res, body);

  if (!res.ok) {
    const b = body as Record<string, unknown> | undefined;
    const err = (b?.error as Record<string, unknown> | undefined) ?? undefined;
    const msg = typeof err?.message === "string" ? err.message : "Redeem fehlgeschlagen.";
    const code = typeof err?.code === "string" ? err.code : "REDEEM_FAILED";
    throw new ApiError({ status: res.status, code, message: msg, traceId, details: err?.details });
  }

  const parsed = body as JsonOk<ProvisionRedeemResponse>;
  if (!parsed?.ok) {
    throw new ApiError({ status: res.status, code: "BAD_SHAPE", message: "Unerwartete Server-Antwort.", traceId });
  }

  return parsed.data;
}

export async function fetchLicense(args: { apiKey: string; tenantSlug?: string | null }): Promise<LicenseResponse> {
  const baseUrl = await resolveBaseUrl();
  const url = `${baseUrl}/api/mobile/v1/license`;

  const apiKey = (args.apiKey || "").trim();
  const t = args.tenantSlug ? normalizeTenantSlug(args.tenantSlug) : (await getAppSettings()).tenantSlug;

  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    authorization: `Bearer ${apiKey}`,
  };
  if (t) headers["x-tenant-slug"] = t;

  const res = await fetchWithDiagnostics(url, { method: "GET", headers }, 12_000);
  const body = await readJsonSafe(res);
  const traceId = pickTraceId(res, body);

  if (!res.ok) {
    const b = body as Record<string, unknown> | undefined;
    const err = (b?.error as Record<string, unknown> | undefined) ?? undefined;
    const msg = typeof err?.message === "string" ? err.message : "Lizenzstatus konnte nicht geprüft werden.";
    const code = typeof err?.code === "string" ? err.code : "LICENSE_CHECK_FAILED";
    throw new ApiError({
      status: res.status,
      code,
      message: msg,
      traceId,
      details: {
        url,
        tenantSlug: t || null,
        apiKeyMasked: apiKey ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` : null,
        serverDetails: err?.details,
      },
    });
  }

  const parsed = body as JsonOk<LicenseResponse>;
  if (!parsed?.ok) {
    throw new ApiError({ status: res.status, code: "BAD_SHAPE", message: "Unerwartete Server-Antwort.", traceId });
  }

  return parsed.data;
}
