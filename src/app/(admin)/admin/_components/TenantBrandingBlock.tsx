"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type TenantDto = { id: string; slug: string; name: string };
type ProfileDto = { legalName: string; displayName: string | null };

type BrandingGetDto = { tenant: TenantDto; profile: ProfileDto | null };

const BRANDING_UPDATED_EVENT = "lr_tenant_branding_updated";

export default function TenantBrandingBlock() {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState<string>("Tenant");
  const [logoOk, setLogoOk] = useState<boolean>(true);
  const [bust, setBust] = useState<number>(() => Date.now());

  const logoSrc = useMemo(() => `/api/admin/v1/tenants/current/logo?ts=${bust}`, [bust]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLogoOk(true);
    setBust(Date.now());

    try {
      const res = await fetch("/api/admin/v1/branding", { method: "GET" });
      const json = (await res.json()) as ApiResp<BrandingGetDto>;

      if (!json.ok) {
        setLoading(false);
        return;
      }

      const t = json.data.tenant;
      const p = json.data.profile;
      const display = p?.displayName || p?.legalName || t?.name || "Tenant";
      setName(display);

      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  const onUpdated = useCallback(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    // eslint wants state updates in callbacks, not synchronously in effect body
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
    <div className="flex min-w-0 items-center gap-3">
      <div className="h-8 w-8 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {logoOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            alt="Logo"
            className="h-full w-full object-contain"
            onError={() => setLogoOk(false)}
          />
        ) : (
          <div className="h-full w-full bg-slate-50" />
        )}
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-900">{loading ? "…" : name}</div>
      </div>
    </div>
  );
}
