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
      logoDataUrl: string | null; // final data-url
    }
  | { kind: "error"; message: string };

type BrandingApiPayload = {
  tenant?: { name?: unknown; slug?: unknown };
  branding?: { hasLogo?: unknown };
  logoDataUrl?: unknown;
  logoBase64Url?: unknown; // path to base64 endpoint
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v : null;
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

  const tenantName =
    isRecord(data.tenant) && typeof data.tenant.name === "string" ? data.tenant.name : null;
  const tenantSlug =
    isRecord(data.tenant) && typeof data.tenant.slug === "string" ? data.tenant.slug : null;

  const hasLogo =
    isRecord(data.branding) && typeof data.branding.hasLogo === "boolean"
      ? data.branding.hasLogo
      : false;

  const logoDataUrl = pickString(data.logoDataUrl);
  const logoBase64Url = pickString(data.logoBase64Url);

  return { tenantName, tenantSlug, hasLogo, logoDataUrl, logoBase64Url };
}

function extractErrorMessage(res: unknown): string {
  if (!isRecord(res)) return "Request failed";
  const maybeError = res.error;
  if (isRecord(maybeError) && typeof maybeError.message === "string") return maybeError.message;
  if (typeof res.message === "string") return res.message;
  return "Request failed";
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
        setState({ kind: "error", message: extractErrorMessage(res) });
        return;
      }

      const parsed = parseBrandingData(res.data);
      if (!parsed) {
        setState({ kind: "error", message: "Invalid branding payload" });
        return;
      }

      // 1) direct data-url vorhanden
      if (parsed.logoDataUrl) {
        setState({
          kind: "ready",
          tenantName: parsed.tenantName,
          tenantSlug: parsed.tenantSlug,
          hasLogo: parsed.hasLogo,
          logoDataUrl: parsed.logoDataUrl,
        });
        return;
      }

      // 2) fallback: base64 endpoint -> data-url bauen
      if (parsed.logoBase64Url) {
        const b64 = await apiFetch({ method: "GET", path: parsed.logoBase64Url, apiKey });

        if (isRecord(b64) && b64.ok === true && isRecord(b64.data)) {
          const mime = pickString(b64.data.mime) ?? "image/png";
          const base64 = pickString(b64.data.base64);

          const dataUrl = base64 ? `data:${mime};base64,${base64}` : null;

          setState({
            kind: "ready",
            tenantName: parsed.tenantName,
            tenantSlug: parsed.tenantSlug,
            hasLogo: parsed.hasLogo,
            logoDataUrl: dataUrl,
          });
          return;
        }
      }

      // 3) kein logo lieferbar
      setState({
        kind: "ready",
        tenantName: parsed.tenantName,
        tenantSlug: parsed.tenantSlug,
        hasLogo: parsed.hasLogo,
        logoDataUrl: null,
      });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Unexpected error" });
    }
  }, []);

  // Lint rule: avoid direct setState chain in effect body
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
