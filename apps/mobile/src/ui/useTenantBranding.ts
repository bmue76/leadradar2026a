import { useCallback, useEffect, useState } from "react";

import { getApiKey } from "../lib/auth";
import { getApiBaseUrl } from "../lib/env";
import { fetchMobileBranding, fetchMobileLogoDataUri, isHexColor, type MobileBrandingDto } from "../lib/branding";
import { getBrandingFromCache, setBrandingCache } from "../lib/brandingCache";

type TenantBrandingError = {
  message: string;
  traceId?: string;
};

export type TenantBrandingState =
  | { status: "idle" | "loading"; tenantName: null; accentColor: null; logoDataUri: null; error: null }
  | {
      status: "ready";
      tenantName: string;
      accentColor: string | null;
      logoDataUri: string | null;
      error: null;
    }
  | { status: "error"; tenantName: null; accentColor: null; logoDataUri: null; error: TenantBrandingError };

type UseTenantBrandingOptions = {
  /**
   * Branding JSON cache TTL. Default: 5 minutes.
   */
  brandingTtlMs?: number;

  /**
   * Logo data-uri cache TTL. Default: 60 minutes.
   */
  logoTtlMs?: number;
};

type LogoCacheEntry = {
  key: string;
  dataUri: string;
  storedAtMs: number;
};

let logoCache: LogoCacheEntry | null = null;

function nowMs(): number {
  return Date.now();
}

function pickTenantName(dto: MobileBrandingDto): string {
  const b = dto.branding;
  const candidate = (b.displayName ?? "").trim() || (b.legalName ?? "").trim() || (b.name ?? "").trim();
  return candidate || "Tenant";
}

function buildLogoCacheKey(dto: MobileBrandingDto): string {
  const b = dto.branding;
  return [
    b.hasLogo ? "1" : "0",
    (b.logoUrl ?? "").trim(),
    (b.logoUpdatedAt ?? "").trim(),
    (b.logoMime ?? "").trim(),
  ].join("|");
}

export function useTenantBranding(opts?: UseTenantBrandingOptions) {
  const brandingTtlMs = opts?.brandingTtlMs ?? 5 * 60_000;
  const logoTtlMs = opts?.logoTtlMs ?? 60 * 60_000;

  const [state, setState] = useState<TenantBrandingState>({
    status: "idle",
    tenantName: null,
    accentColor: null,
    logoDataUri: null,
    error: null,
  });

  const refresh = useCallback(async () => {
    setState({ status: "loading", tenantName: null, accentColor: null, logoDataUri: null, error: null });

    const key = await getApiKey();
    if (!key) {
      // Not provisioned yet → keep a neutral state (no redirect from here)
      setState({
        status: "ready",
        tenantName: "LeadRadar",
        accentColor: null,
        logoDataUri: null,
        error: null,
      });
      return;
    }

    // 1) JSON cache
    const cached = getBrandingFromCache(brandingTtlMs);
    let dto: MobileBrandingDto | null = cached;

    if (!dto) {
      const res = await fetchMobileBranding({ apiKey: key });
      if (!res.ok) {
        setState({
          status: "error",
          tenantName: null,
          accentColor: null,
          logoDataUri: null,
          error: { message: res.message ?? "Branding konnte nicht geladen werden.", traceId: res.traceId },
        });
        return;
      }
      dto = res.data;
      setBrandingCache(dto);
    }

    const tenantName = pickTenantName(dto);
    const accentColor = isHexColor(dto.branding.accentColor) ? dto.branding.accentColor : null;

    // 2) Logo data-uri cache
    let logoDataUri: string | null = null;
    const logoKey = buildLogoCacheKey(dto);

    if (dto.branding.hasLogo && dto.branding.logoUrl) {
      const cacheOk =
        logoCache &&
        logoCache.key === logoKey &&
        nowMs() - logoCache.storedAtMs <= logoTtlMs &&
        typeof logoCache.dataUri === "string" &&
        logoCache.dataUri.length > 32;

      if (cacheOk) {
        logoDataUri = logoCache!.dataUri;
      } else {
        const baseUrl = getApiBaseUrl();
        const dataUri = await fetchMobileLogoDataUri({
          apiKey: key,
          logoPath: dto.branding.logoUrl,
          versionHint: dto.branding.logoUpdatedAt,
          baseUrlOverride: baseUrl,
        });

        if (dataUri) {
          logoDataUri = dataUri;
          logoCache = { key: logoKey, dataUri, storedAtMs: nowMs() };
        }
      }
    } else {
      // No logo → clear in-memory logo cache to prevent stale display
      if (logoCache?.key === logoKey) logoCache = null;
    }

    setState({
      status: "ready",
      tenantName,
      accentColor,
      logoDataUri,
      error: null,
    });
  }, [brandingTtlMs, logoTtlMs]);

  useEffect(() => {
    // Avoid "setState-in-effect" lint rule: schedule async load.
    const id = setTimeout(() => {
      void refresh();
    }, 0);

    return () => clearTimeout(id);
  }, [refresh]);

  return { state, refresh };
}
