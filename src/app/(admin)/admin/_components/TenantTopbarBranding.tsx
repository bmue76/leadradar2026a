"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type TenantDto = { id: string; slug: string; name: string };
type ProfileDto = { legalName: string; displayName: string | null };
type BrandingGetDto = { tenant: TenantDto; profile: ProfileDto | null };

const BRANDING_UPDATED_EVENT = "lr_tenant_branding_updated";

function pickTenantDisplayName(dto: BrandingGetDto | null): string {
  if (!dto) return "Tenant";
  const t = dto.tenant;
  const p = dto.profile;
  const display = p?.displayName || p?.legalName || t?.name || "Tenant";
  return typeof display === "string" && display.trim().length ? display.trim() : "Tenant";
}

async function fetchLogoVersionTag(): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/v1/tenants/current/logo", { method: "HEAD", cache: "no-store" });
    if (!res.ok) return null;
    const etag = res.headers.get("etag");
    if (etag && etag.trim().length) return etag.trim();
    const lm = res.headers.get("last-modified");
    if (lm && lm.trim().length) return lm.trim();
    return "1";
  } catch {
    return null;
  }
}

export function TenantTopbarBranding() {
  const [loading, setLoading] = useState(true);
  const [tenantName, setTenantName] = useState<string>("Tenant");

  const [logoOk, setLogoOk] = useState(false);
  const [logoTag, setLogoTag] = useState<string | null>(null);

  const logoSrc = useMemo(() => {
    if (!logoTag) return "/api/admin/v1/tenants/current/logo";
    return `/api/admin/v1/tenants/current/logo?v=${encodeURIComponent(logoTag)}`;
  }, [logoTag]);

  const refresh = useCallback(async () => {
    setLoading(true);

    // Name
    try {
      const res = await fetch("/api/admin/v1/branding", { method: "GET", cache: "no-store" });
      const json = (await res.json()) as ApiResp<BrandingGetDto>;
      if (json.ok) {
        setTenantName(pickTenantDisplayName(json.data));
      }
    } catch {
      // ignore
    }

    // Logo (hydration-safe): use stable ETag instead of Date.now()
    const tag = await fetchLogoVersionTag();
    setLogoTag(tag);
    setLogoOk(Boolean(tag));

    setLoading(false);
  }, []);

  const onUpdated = useCallback(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    // Schedule async AFTER hydration
    const id = window.setTimeout(() => {
      onUpdated();
    }, 0);

    window.addEventListener(BRANDING_UPDATED_EVENT, onUpdated);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener(BRANDING_UPDATED_EVENT, onUpdated);
    };
  }, [onUpdated]);

  return (
    <div className="flex items-center justify-between gap-4">
      {/* Tenant Name: same visual weight as title "LeadRadar Admin" */}
      <div className="min-w-0">
        <div className="truncate text-base font-semibold text-slate-900">{loading ? "…" : tenantName}</div>
      </div>

      {/* Logo: bigger, no frame, right aligned (content aligned via AdminShell wrapper) */}
      <div className="flex h-9 w-[190px] items-center justify-end" aria-label="Tenant Logo">
        {logoOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            alt=""
            className="max-h-9 w-auto max-w-[190px] object-contain"
            onError={() => setLogoOk(false)}
          />
        ) : (
          <div className="h-9 w-[190px]" />
        )}
      </div>
    </div>
  );
}
