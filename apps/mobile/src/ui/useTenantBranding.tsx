// apps/mobile/src/ui/useTenantBranding.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { getApiKey } from "../lib/auth";
import { fetchMobileBranding, fetchMobileLogoDataUri, isHexColor, type MobileBrandingDto } from "../lib/branding";
import { getBrandingFromCache, setBrandingCache } from "../lib/brandingCache";

export type TenantBrandingState =
  | { status: "loading" }
  | { status: "ready"; tenantName: string; accentColor: string | null; logoDataUri: string | null }
  | { status: "error"; message: string; traceId?: string };

type TenantBrandingContextValue = {
  state: TenantBrandingState;
  refresh: () => Promise<void>;
};

const Ctx = createContext<TenantBrandingContextValue | null>(null);

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

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TenantBrandingState>({ status: "loading" });

  const refresh = useCallback(async () => {
    const key = await getApiKey();
    if (!key) {
      setState({ status: "ready", tenantName: "LeadRadar", accentColor: null, logoDataUri: null });
      return;
    }

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

    // 2) fetch current
    const res = await fetchMobileBranding({ apiKey: key });

    if (!res.ok) {
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

    const rawAccent = dto.branding.accentColor ?? null;
    const accentColor = isHexColor(rawAccent) ? rawAccent.toUpperCase() : null;

    let logoDataUri: string | null = null;
    if (dto.branding.hasLogo && dto.branding.logoUrl) {
      logoDataUri =
        (await fetchMobileLogoDataUri({
          apiKey: key,
          logoPath: dto.branding.logoUrl,
          versionHint: dto.branding.logoUpdatedAt,
        })) ?? null;
    }

    await setBrandingCache({ tenantName, accentColor, logoDataUri, updatedAt: new Date().toISOString() });

    setState({ status: "ready", tenantName, accentColor, logoDataUri });
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void refresh(), 0);
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