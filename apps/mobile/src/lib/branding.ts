import { getApiBaseUrl } from "./env";
import { apiFetch, type ApiResult } from "./api";

export type MobileBrandingDto = {
  tenant: {
    slug: string;
  };
  branding: {
    name: string;
    legalName: string;
    displayName: string | null;
    accentColor: string | null;
    hasLogo: boolean;
    logoMime: string | null;
    logoUpdatedAt: string | null;
    logoUrl: string | null; // path, e.g. "/api/mobile/v1/branding/logo"
  };
};

export type FetchBrandingArgs = {
  apiKey: string;
  /**
   * Optional override for API origin, e.g. "http://192.168.1.119:3000".
   * If omitted, env base url is used.
   */
  baseUrl?: string | null;
};

export function isHexColor(s: string | null): s is string {
  if (!s) return false;
  return /^#[0-9A-Fa-f]{6}$/.test(s);
}

function normalizeBaseUrl(baseUrl: string): string {
  const b = (baseUrl ?? "").trim();
  if (!b) return "";
  return b.endsWith("/") ? b.slice(0, -1) : b;
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * Convenience helper: build an absolute URL for the logo path.
 * (Note: rendering a protected logo via <Image> still needs a data-uri fetch,
 * because RN Image cannot send custom headers.)
 */
export function buildMobileLogoUrl(baseUrl: string, logoUrl: string | null): string | null {
  if (!logoUrl) return null;
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return null;
  return `${base}${logoUrl.startsWith("/") ? "" : "/"}${logoUrl}`;
}

/**
 * Fetch branding JSON via standard API contract:
 * { ok: true, data, traceId } / { ok:false, error, traceId }
 */
export async function fetchMobileBranding(args: FetchBrandingArgs): Promise<ApiResult<MobileBrandingDto>> {
  const override = normalizeBaseUrl(args.baseUrl ?? "");
  const urlOrPath = override ? `${override}/api/mobile/v1/branding` : "/api/mobile/v1/branding";

  const res = await apiFetch<MobileBrandingDto>({
    method: "GET",
    path: urlOrPath, // apiFetch supports absolute URLs too
    apiKey: args.apiKey,
  });

  return res;
}

function base64FromBytes(bytes: Uint8Array): string {
  // Prefer Buffer if available (many RN/Expo builds provide it)
  const g = globalThis as unknown as { Buffer?: { from: (b: Uint8Array) => { toString: (enc: string) => string } } };
  if (g.Buffer) {
    return g.Buffer.from(bytes).toString("base64");
  }

  // Manual base64 (no dependencies)
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  let i = 0;

  while (i < bytes.length) {
    const a = bytes[i++] ?? 0;
    const b = i < bytes.length ? (bytes[i++] ?? 0) : 0;
    const c = i < bytes.length ? (bytes[i++] ?? 0) : 0;

    const triple = (a << 16) | (b << 8) | c;

    out += chars[(triple >> 18) & 63];
    out += chars[(triple >> 12) & 63];
    out += i - 2 < bytes.length ? chars[(triple >> 6) & 63] : "=";
    out += i - 1 < bytes.length ? chars[triple & 63] : "=";
  }

  return out;
}

/**
 * Fetch tenant logo via auth-protected endpoint and convert to data URI
 * so React Native <Image> can render it without custom headers.
 *
 * If baseUrlOverride is omitted, env base url is used.
 */
export async function fetchMobileLogoDataUri(args: {
  apiKey: string;
  logoPath: string; // e.g. "/api/mobile/v1/branding/logo"
  versionHint?: string | null; // e.g. logoUpdatedAt
  baseUrlOverride?: string | null;
}): Promise<string | null> {
  const base = normalizeBaseUrl(args.baseUrlOverride ?? "") || getApiBaseUrl();
  const url = joinUrl(base, args.logoPath);

  // Cache bust on updates (logoUpdatedAt from JSON)
  const v = (args.versionHint ?? "").trim();
  const finalUrl = v ? `${url}?v=${encodeURIComponent(v)}` : url;

  let res: Response;
  try {
    res = await fetch(finalUrl, {
      method: "GET",
      headers: {
        "x-api-key": args.apiKey.trim(),
      },
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const mime = res.headers.get("content-type") || "image/png";
  let buf: ArrayBuffer;
  try {
    buf = await res.arrayBuffer();
  } catch {
    return null;
  }

  const b64 = base64FromBytes(new Uint8Array(buf));
  return `data:${mime};base64,${b64}`;
}
