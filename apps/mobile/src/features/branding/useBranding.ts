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
      logoDataUrl: string | null;
    }
  | { kind: "error"; message: string };

type BrandingApiPayload = {
  tenant?: { name?: unknown; slug?: unknown };
  branding?: { hasLogo?: unknown };
  logoDataUrl?: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseBrandingData(raw: unknown): {
  tenantName: string | null;
  tenantSlug: string | null;
  hasLogo: boolean;
  logoDataUrl: string | null;
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

  const logoDataUrl = typeof data.logoDataUrl === "string" ? data.logoDataUrl : null;

  return { tenantName, tenantSlug, hasLogo, logoDataUrl };
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

      // apiFetch returns unknown -> validate minimal envelope shape
      if (!isRecord(res) || typeof res.ok !== "boolean") {
        setState({ kind: "error", message: "Invalid API response shape" });
        return;
      }

      if (res.ok !== true) {
        const msg = typeof res.message === "string" ? res.message : "Request failed";
        setState({ kind: "error", message: msg });
        return;
      }

      const parsed = parseBrandingData(res.data);
      if (!parsed) {
        setState({ kind: "error", message: "Invalid branding payload" });
        return;
      }

      setState({ kind: "ready", ...parsed });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Unexpected error" });
    }
  }, []);

  // Avoid calling setState synchronously inside effect body (lint rule react-hooks/set-state-in-effect)
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
