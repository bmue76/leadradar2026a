// apps/mobile/src/ui/useTenantBranding.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { getApiKey } from "../lib/auth";
import { fetchMobileBranding, fetchMobileLogoDataUri, isHexColor, type MobileBrandingDto } from "../lib/branding";
import { getBrandingFromCache, setBrandingCache, type BrandingCacheDto } from "../lib/brandingCache";

export type TenantBrandingState =
  | { status: "loading" }
  | { status: "ready"; tenantName: string; accentColor: string | null; logoDataUri: string | null }
  | { status: "error"; message: string; traceId?: string };

type TenantBrandingContextValue = {
  state: TenantBrandingState;
  refresh: (opts?: { force?: boolean }) => Promise<void>;
};

const Ctx = createContext<TenantBrandingContextValue | null>(null);

/** Cache policy */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MIN_REVALIDATE_MS = 10 * 60 * 1000; // 10min: prevent focus-spam

function pickTenantName(dto: MobileBrandingDto): string {
  const b = dto.branding;
  const name = (b.displayName || b.legalName || b.name || "LeadRadar").trim();
  return name.length ? name : "LeadRadar";
}

function pickErrMessage(res: unknown): string {
  const r = res as Record<string, unknown> | null;

  const msg = r && typeof r.message === "string" ? r.message : null;
  if (msg && msg.trim()) return msg;

  const errObj = r && typeof r.error === "object" && r.error ? (r.error as Record<string, unknown>) : null;
  const errMsg = errObj && typeof errObj.message === "string" ? errObj.message : null;
  if (errMsg && errMsg.trim()) return errMsg;

  return "Branding konnte nicht geladen werden.";
}

function pickTraceId(res: unknown): string | undefined {
  const r = res as Record<string, unknown> | null;
  const t = r && typeof r.traceId === "string" ? r.traceId : null;
  return t && t.trim() ? t : undefined;
}

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function normalizeAccent(raw: string | null): string | null {
  if (!raw) return null;
  return isHexColor(raw) ? raw.toUpperCase() : null;
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TenantBrandingState>({ status: "loading" });

  const lastFetchAtMsRef = useRef<number>(0);

  const refresh = useCallback(async (opts?: { force?: boolean }) => {
    const force = !!opts?.force;

    const key = await getApiKey();
    if (!key) {
      setState({ status: "ready", tenantName: "LeadRadar", accentColor: null, logoDataUri: null });
      return;
    }

    const nowMs = Date.now();

    // 1) cache first (fast paint)
    const cached = await getBrandingFromCache();

    if (cached) {
      setState({
        status: "ready",
        tenantName: cached.tenantName,
        accentColor: cached.accentColor,
        logoDataUri: cached.logoDataUri,
      });
    } else {
      setState({ status: "loading" });
    }

    // 2) decide whether to revalidate
    const cachedUpdatedAtMs = cached ? parseMs(cached.updatedAt) : null;
    const cachedAgeMs = cachedUpdatedAtMs ? nowMs - cachedUpdatedAtMs : null;
    const cachedFresh = cachedAgeMs !== null ? cachedAgeMs < CACHE_TTL_MS : false;

    const sinceLastFetch = nowMs - (lastFetchAtMsRef.current || 0);
    const shouldRevalidate = force || !cached || !cachedFresh || sinceLastFetch > MIN_REVALIDATE_MS;

    if (!shouldRevalidate) return;

    lastFetchAtMsRef.current = nowMs;

    // 3) fetch current (network)
    const res = await fetchMobileBranding({ apiKey: key });

    if (!res.ok) {
      // If we have cached state, keep it silently.
      if (!cached) {
        setState({
          status: "error",
          message: pickErrMessage(res),
          traceId: pickTraceId(res),
        });
      }
      return;
    }

    const dto = res.data;
    const tenantName = pickTenantName(dto);
    const accentColor = normalizeAccent(dto.branding.accentColor ?? null);

    // Logo: only refetch if version changed (logoUpdatedAt) or cache missing
    const nextLogoUpdatedAt = dto.branding.logoUpdatedAt ?? null;

    let logoDataUri: string | null = null;
    if (dto.branding.hasLogo && dto.branding.logoUrl) {
      const cachedLogoSameVersion =
        !!cached?.logoDataUri && !!cached?.logoUpdatedAt && cached.logoUpdatedAt === nextLogoUpdatedAt;

      if (cachedLogoSameVersion) {
        logoDataUri = cached!.logoDataUri;
      } else {
        const fetched =
          (await fetchMobileLogoDataUri({
            apiKey: key,
            logoPath: dto.branding.logoUrl,
            versionHint: nextLogoUpdatedAt,
          })) ?? null;

        // If fetching fails but we had a cached image, keep it.
        logoDataUri = fetched ?? cached?.logoDataUri ?? null;
      }
    } else {
      logoDataUri = null;
    }

    const cacheDto: BrandingCacheDto = {
      tenantName,
      accentColor,
      logoDataUri,
      logoUpdatedAt: dto.branding.hasLogo ? nextLogoUpdatedAt : null,
      updatedAt: new Date().toISOString(),
    };

    await setBrandingCache(cacheDto);

    setState({ status: "ready", tenantName, accentColor, logoDataUri });
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void refresh({ force: true }), 0);
    return () => clearTimeout(id);
  }, [refresh]);

  const value = useMemo<TenantBrandingContextValue>(() => ({ state, refresh }), [state, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTenantBranding(): TenantBrandingContextValue {
  const v = useContext(Ctx);
  if (!v) {
    return {
      state: { status: "ready", tenantName: "LeadRadar", accentColor: null, logoDataUri: null },
      refresh: async () => {},
    };
  }
  return v;
}
