"use client";

import { useCallback, useEffect } from "react";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type TenantDto = { id: string; slug: string; name: string; accentColor: string | null };
type ProfileDto = { legalName: string; displayName: string | null; accentColor: string | null };
type BrandingGetDto = { tenant: TenantDto; profile: ProfileDto | null };

const BRANDING_UPDATED_EVENT = "lr_tenant_branding_updated";

function isHexColor(s: string | null): s is string {
  if (!s) return false;
  return /^#[0-9A-Fa-f]{6}$/.test(s);
}

function setAccentVars(accent: string | null) {
  const root = document.documentElement;

  // Default: neutral (Apple-clean). Accent can be used selectively.
  const fallback = "#0F172A"; // slate-900
  const value = isHexColor(accent) ? accent.toUpperCase() : fallback;

  root.style.setProperty("--lr-accent", value);
  root.style.setProperty("--lr-accent-soft", value);
}

export function AdminAccentProvider() {
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/v1/branding", { method: "GET" });
      const json = (await res.json()) as ApiResp<BrandingGetDto>;
      if (!json.ok) return;

      const accent = json.data.profile?.accentColor ?? json.data.tenant.accentColor ?? null;
      setAccentVars(accent);
    } catch {
      setAccentVars(null);
    }
  }, []);

  const onUpdated = useCallback(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      onUpdated();
    }, 0);

    window.addEventListener(BRANDING_UPDATED_EVENT, onUpdated);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener(BRANDING_UPDATED_EVENT, onUpdated);
    };
  }, [onUpdated]);

  return null;
}
