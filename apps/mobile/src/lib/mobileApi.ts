import { API_BASE_URL, requireBaseUrl } from "./mobileConfig";

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

function networkHint(url: string) {
  if (url.includes("localhost") || url.includes("127.0.0.1")) {
    return "Base URL zeigt auf localhost. Android erreicht das nicht. Gerät: http://<LAN-IP>:3000";
  }
  return "Host/Netz/Firewall prüfen. Teste die Base URL im Android-Browser.";
}

async function fetchWithDiagnostics(input: RequestInfo, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (e: unknown) {
    const url = typeof input === "string" ? input : "(request)";
    const msg = e instanceof Error ? e.message : String(e);
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message: "Network request failed",
      details: {
        url,
        baseUrl: API_BASE_URL || "(not set)",
        hint: networkHint(String(url)),
        rawError: msg,
      },
    });
  }
}

export async function redeemProvisioning(tenantSlug: string, code: string): Promise<ProvisionRedeemResponse> {
  requireBaseUrl();
  const url = `${API_BASE_URL}/api/mobile/v1/provisioning/redeem`;

  const t = (tenantSlug || "").trim().toLowerCase();
  const c = (code || "").replace(/\s+/g, "").trim().toUpperCase();

  const res = await fetchWithDiagnostics(url, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-tenant-slug": t,
    },
    body: JSON.stringify({ tenantSlug: t, code: c }),
  });

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
  requireBaseUrl();
  const url = `${API_BASE_URL}/api/mobile/v1/license`;

  const apiKey = (args.apiKey || "").trim();

  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    authorization: `Bearer ${apiKey}`,
  };

  if (args.tenantSlug) headers["x-tenant-slug"] = args.tenantSlug;

  const res = await fetchWithDiagnostics(url, { method: "GET", headers });
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
        tenantSlug: args.tenantSlug || null,
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
