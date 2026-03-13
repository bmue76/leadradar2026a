import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";

import { apiFetch } from "../../lib/api";
import { getApiKey } from "../../lib/auth";
import { getAppSettings } from "../../lib/appSettings";

type BrandingState =
  | { kind: "loading" }
  | {
      kind: "ready";
      tenantName: string | null;
      tenantSlug: string | null;
      accentColor: string | null;
      hasLogo: boolean;
      logoDataUrl: string | null;
    }
  | { kind: "error"; message: string };

type ParsedBranding = {
  tenantName: string | null;
  tenantSlug: string | null;
  accentColor: string | null;
  hasLogo: boolean;
  logoRef: string | null;
  logoBase64Url: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const s = pickString(value);
    if (s) return s;
  }
  return null;
}

function firstBoolean(...values: unknown[]): boolean {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return false;
}

function isPlaceholderName(value: string | null): boolean {
  if (!value) return true;
  const s = value.trim().toLowerCase();
  return s === "demo" || s === "test" || s === "tenant" || s === "kunde" || s === "customer";
}

function prettifySlug(slug: string | null): string | null {
  if (!slug) return null;

  const clean = slug.trim();
  if (!clean) return null;

  return clean
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path) || path.startsWith("data:")) return path;
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

function absolutizeMaybe(baseUrl: string | null | undefined, value: string | null): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  if (!baseUrl) return value;
  return joinUrl(baseUrl, value);
}

function normalizeAccentColor(value: string | null): string | null {
  if (!value) return null;
  const s = value.trim();

  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return s;
  if (/^rgb(a)?\(/i.test(s)) return s;

  return null;
}

function parseBrandingData(raw: unknown): ParsedBranding | null {
  if (!isRecord(raw)) return null;

  const tenant = isRecord(raw.tenant) ? raw.tenant : null;
  const branding = isRecord(raw.branding) ? raw.branding : null;
  const data = isRecord(raw.data) ? raw.data : null;

  const tenantName =
    firstString(
      branding?.tenantName,
      branding?.name,
      tenant?.officialName,
      tenant?.companyName,
      tenant?.name,
      raw.tenantName,
      raw.name,
      data?.tenantName,
      data?.name
    ) ?? null;

  const tenantSlug =
    firstString(
      tenant?.slug,
      raw.tenantSlug,
      branding?.tenantSlug,
      data?.tenantSlug,
      data?.slug
    ) ?? null;

  const accentColor = normalizeAccentColor(
    firstString(
      branding?.accentColor,
      tenant?.accentColor,
      raw.accentColor,
      data?.accentColor
    )
  );

  const logoRef =
    firstString(
      branding?.logoUrl,
      branding?.logoDataUrl,
      raw.logoUrl,
      raw.logoDataUrl,
      tenant?.logoUrl,
      tenant?.logoDataUrl,
      data?.logoUrl,
      data?.logoDataUrl
    ) ?? null;

  const logoBase64Url =
    firstString(
      branding?.logoBase64Url,
      raw.logoBase64Url,
      data?.logoBase64Url
    ) ?? null;

  const hasLogo = firstBoolean(
    branding?.hasLogo,
    raw.hasLogo,
    data?.hasLogo,
    !!logoRef,
    !!logoBase64Url
  );

  return {
    tenantName,
    tenantSlug,
    accentColor,
    hasLogo,
    logoRef,
    logoBase64Url,
  };
}

function extractErrorMessage(res: unknown): string {
  if (!isRecord(res)) return "Request failed";

  const maybeError = isRecord(res.error) ? res.error : null;
  if (maybeError && typeof maybeError.message === "string") return maybeError.message;
  if (typeof res.message === "string") return res.message;

  return "Request failed";
}

export function useBranding() {
  const [state, setState] = useState<BrandingState>({ kind: "loading" });

  const refresh = useCallback(async () => {
    try {
      const settings = await getAppSettings();
      const baseUrl = settings.effectiveBaseUrl ?? null;
      const fallbackSlug = settings.tenantSlug ?? null;
      const fallbackTenantName = prettifySlug(fallbackSlug);

      const apiKey = await getApiKey();
      if (!apiKey) {
        setState({
          kind: "ready",
          tenantName: isPlaceholderName(fallbackTenantName) ? null : fallbackTenantName,
          tenantSlug: fallbackSlug,
          accentColor: null,
          hasLogo: false,
          logoDataUrl: null,
        });
        return;
      }

      const res = await apiFetch({
        method: "GET",
        path: "/api/mobile/v1/branding",
        apiKey,
        timeoutMs: 10_000,
      });

      if (!isRecord(res) || typeof res.ok !== "boolean") {
        setState({
          kind: "ready",
          tenantName: isPlaceholderName(fallbackTenantName) ? null : fallbackTenantName,
          tenantSlug: fallbackSlug,
          accentColor: null,
          hasLogo: false,
          logoDataUrl: null,
        });
        return;
      }

      if (res.ok !== true) {
        setState({
          kind: "error",
          message: extractErrorMessage(res),
        });
        return;
      }

      const parsed = parseBrandingData(res.data);
      if (!parsed) {
        setState({
          kind: "ready",
          tenantName: isPlaceholderName(fallbackTenantName) ? null : fallbackTenantName,
          tenantSlug: fallbackSlug,
          accentColor: null,
          hasLogo: false,
          logoDataUrl: null,
        });
        return;
      }

      const effectiveTenantSlug = parsed.tenantSlug ?? fallbackSlug ?? null;
      const effectiveTenantName = !isPlaceholderName(parsed.tenantName)
        ? parsed.tenantName
        : !isPlaceholderName(fallbackTenantName)
          ? fallbackTenantName
          : null;

      const absoluteBase64Url = absolutizeMaybe(baseUrl, parsed.logoBase64Url);

      if (absoluteBase64Url) {
        const b64 = await apiFetch({
          method: "GET",
          path: absoluteBase64Url,
          apiKey,
          timeoutMs: 10_000,
        });

        if (isRecord(b64) && b64.ok === true && isRecord(b64.data)) {
          const mime = firstString(b64.data.mime, b64.data.contentType, "image/png") ?? "image/png";
          const base64 = firstString(b64.data.base64, b64.data.data, b64.data.value);
          const dataUrl = base64 ? `data:${mime};base64,${base64}` : null;

          setState({
            kind: "ready",
            tenantName: effectiveTenantName,
            tenantSlug: effectiveTenantSlug,
            accentColor: parsed.accentColor,
            hasLogo: parsed.hasLogo || !!dataUrl,
            logoDataUrl: dataUrl,
          });
          return;
        }
      }

      const absoluteLogoRef = absolutizeMaybe(baseUrl, parsed.logoRef);

      if (absoluteLogoRef?.startsWith("data:") || /^https?:\/\//i.test(absoluteLogoRef ?? "")) {
        setState({
          kind: "ready",
          tenantName: effectiveTenantName,
          tenantSlug: effectiveTenantSlug,
          accentColor: parsed.accentColor,
          hasLogo: parsed.hasLogo || !!absoluteLogoRef,
          logoDataUrl: absoluteLogoRef,
        });
        return;
      }

      setState({
        kind: "ready",
        tenantName: effectiveTenantName,
        tenantSlug: effectiveTenantSlug,
        accentColor: parsed.accentColor,
        hasLogo: parsed.hasLogo,
        logoDataUrl: null,
      });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Unexpected error",
      });
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void refresh();
    }, 0);

    return () => clearTimeout(t);
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => undefined;
    }, [refresh])
  );

  const branding = useMemo(() => {
    if (state.kind !== "ready") {
      return {
        tenantName: null,
        tenantSlug: null,
        accentColor: null,
        hasLogo: false,
        logoDataUrl: null,
      };
    }

    return state;
  }, [state]);

  return { state, branding, refresh };
}
