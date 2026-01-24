import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { getApiKey } from "../../lib/auth";

type BrandingState =
  | { kind: "loading" }
  | {
      kind: "ready";
      tenantName: string | null;
      tenantSlug: string | null;
      hasLogo: boolean;
      logoDataUrl: string | null; // data:image/...;base64,... OR direct dataUrl
    }
  | { kind: "error"; message: string };

type BrandingApiPayload = {
  tenant?: { name?: unknown; slug?: unknown };
  branding?: { hasLogo?: unknown };
  logoDataUrl?: unknown;
  logoBase64Url?: unknown; // <-- support
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseBrandingData(raw: unknown): {
  tenantName: string | null;
  tenantSlug: string | null;
  hasLogo: boolean;
  logoDataUrl: string | null;
  logoBase64Url: string | null;
} | null {
  if (!isRecord(raw)) return null;
  const data = raw as BrandingApiPayload;

  const tenantName = isRecord(data.tenant) && typeof data.tenant.name === "string" ? data.tenant.name : null;
  const tenantSlug = isRecord(data.tenant) && typeof data.tenant.slug === "string" ? data.tenant.slug : null;

  const hasLogo = isRecord(data.branding) && typeof data.branding.hasLogo === "boolean" ? data.branding.hasLogo : false;

  const logoDataUrl = typeof data.logoDataUrl === "string" ? data.logoDataUrl : null;

  const base64UrlRaw = (data as Record<string, unknown>).logoBase64Url;
  const logoBase64Url = typeof base64UrlRaw === "string" ? base64UrlRaw : null;

  return { tenantName, tenantSlug, hasLogo, logoDataUrl, logoBase64Url };
}

function parseBase64Payload(raw: unknown): { mime: string; base64: string } | null {
  if (!isRecord(raw)) return null;
  const mime = raw.mime;
  const base64 = raw.base64;
  if (typeof mime !== "string" || !mime.trim()) return null;
  if (typeof base64 !== "string" || !base64.trim()) return null;
  return { mime: mime.trim(), base64: base64.trim() };
}

export function useBranding() {
  const [state, setState] = useState<BrandingState>({ kind: "loading" });

  const refresh = useCallback(async () => {
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        setState({ kind: "ready", tenantName: null, tenantSlug: null, hasLogo: false, logoDataUrl: null });
        return;
      }

      const res = await apiFetch({ method: "GET", path: "/api/mobile/v1/branding", apiKey });

      if (!isRecord(res) || typeof res.ok !== "boolean") {
        setState({ kind: "error", message: "Invalid API response shape" });
        return;
      }

      if (res.ok !== true) {
        const msg = typeof (res as Record<string, unknown>).message === "string" ? String((res as Record<string, unknown>).message) : "Request failed";
        setState({ kind: "error", message: msg });
        return;
      }

      const parsed = parseBrandingData((res as Record<string, unknown>).data);
      if (!parsed) {
        setState({ kind: "error", message: "Invalid branding payload" });
        return;
      }

      // 1) If backend already gives dataUrl, use it
      if (parsed.logoDataUrl) {
        setState({ kind: "ready", tenantName: parsed.tenantName, tenantSlug: parsed.tenantSlug, hasLogo: parsed.hasLogo, logoDataUrl: parsed.logoDataUrl });
        return;
      }

      // 2) If backend gives a base64 endpoint, resolve it
      if (parsed.logoBase64Url) {
        const logoRes = await apiFetch({ method: "GET", path: parsed.logoBase64Url, apiKey });

        if (isRecord(logoRes) && logoRes.ok === true) {
          const data = (logoRes as Record<string, unknown>).data;
          const b64 = parseBase64Payload(data);
          if (b64) {
            const dataUrl = `data:${b64.mime};base64,${b64.base64}`;
            setState({ kind: "ready", tenantName: parsed.tenantName, tenantSlug: parsed.tenantSlug, hasLogo: parsed.hasLogo, logoDataUrl: dataUrl });
            return;
          }
        }

        // fallback: no logo
        setState({ kind: "ready", tenantName: parsed.tenantName, tenantSlug: parsed.tenantSlug, hasLogo: parsed.hasLogo, logoDataUrl: null });
        return;
      }

      // 3) No logo info
      setState({ kind: "ready", tenantName: parsed.tenantName, tenantSlug: parsed.tenantSlug, hasLogo: parsed.hasLogo, logoDataUrl: null });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Unexpected error" });
    }
  }, []);

  // keep your lint-friendly async kickoff
  useEffect(() => {
    const t = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const branding = useMemo(() => {
    if (state.kind !== "ready") return { tenantName: null, tenantSlug: null, hasLogo: false, logoDataUrl: null };
    return state;
  }, [state]);

  return { state, branding, refresh };
}
