"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MobileBrandingDto } from "../src/lib/branding";
import { fetchMobileBranding, buildMobileLogoUrl } from "../src/lib/branding";
import { getBrandingFromCache, setBrandingCache } from "../src/lib/brandingCache";

type BrandingState =
  | { status: "idle" | "loading"; data: null; error: null }
  | { status: "ready"; data: MobileBrandingDto; error: null }
  | { status: "error"; data: null; error: { message: string; traceId?: string } };

type BrandingContextValue = {
  state: BrandingState;
  refresh: () => Promise<void>;
  logoAbsUrl: string | null;
  accentColor: string | null;
  displayName: string | null;
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error("useBranding must be used within BrandingProvider");
  return ctx;
}

export type BrandingProviderProps = {
  baseUrl: string;
  apiKey: string;
  children: React.ReactNode;
  cacheTtlMs?: number; // default 5min
};

function normalizeBaseUrl(baseUrl: string): string {
  const b = (baseUrl ?? "").trim();
  if (!b) return "";
  return b.endsWith("/") ? b.slice(0, -1) : b;
}

export function BrandingProvider(props: BrandingProviderProps) {
  const ttlMs = props.cacheTtlMs ?? 5 * 60_000;

  const [state, setState] = useState<BrandingState>({ status: "idle", data: null, error: null });

  const refresh = useCallback(async () => {
    setState({ status: "loading", data: null, error: null });

    try {
      const base = normalizeBaseUrl(props.baseUrl);
      if (!base) {
        setState({ status: "error", data: null, error: { message: "baseUrl is required" } });
        return;
      }

      const res = await fetchMobileBranding({ baseUrl: base, apiKey: props.apiKey });

      if (!res.ok) {
        setState({
          status: "error",
          data: null,
          error: { message: res.message ?? "Branding failed.", traceId: res.traceId },
        });
        return;
      }

      setBrandingCache(res.data);
      setState({ status: "ready", data: res.data, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unexpected error";
      setState({ status: "error", data: null, error: { message: msg } });
    }
  }, [props.apiKey, props.baseUrl]);

  useEffect(() => {
    const cached = getBrandingFromCache(ttlMs);

    const id = setTimeout(() => {
      if (cached) {
        setState({ status: "ready", data: cached, error: null });
        return;
      }
      void refresh();
    }, 0);

    return () => clearTimeout(id);
  }, [refresh, ttlMs]);

  const logoAbsUrl = useMemo(() => {
    if (state.status !== "ready") return null;
    const base = normalizeBaseUrl(props.baseUrl);
    if (!base) return null;
    return buildMobileLogoUrl(base, state.data.branding.logoUrl);
  }, [props.baseUrl, state]);

  const accentColor = useMemo(() => {
    if (state.status !== "ready") return null;
    return state.data.branding.accentColor ?? null;
  }, [state]);

  const displayName = useMemo(() => {
    if (state.status !== "ready") return null;
    return state.data.branding.name ?? null;
  }, [state]);

  const value: BrandingContextValue = useMemo(
    () => ({
      state,
      refresh,
      logoAbsUrl,
      accentColor,
      displayName,
    }),
    [state, refresh, logoAbsUrl, accentColor, displayName],
  );

  return <BrandingContext.Provider value={value}>{props.children}</BrandingContext.Provider>;
}
