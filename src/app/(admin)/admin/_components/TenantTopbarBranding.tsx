"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./TenantLogo.module.css";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type TenantDto = { id: string; slug: string; name: string };
type ProfileDto = { legalName: string; displayName: string | null };
type BrandingGetDto = { tenant: TenantDto; profile: ProfileDto | null };

const BRANDING_UPDATED_EVENT = "lr_tenant_branding_updated";

export function TenantTopbarBranding() {
  const [loading, setLoading] = useState(true);
  const [tenantName, setTenantName] = useState<string>("Tenant");

  const [logoOk, setLogoOk] = useState(true);

  // IMPORTANT: do NOT use Date.now() in initial state (SSR hydration mismatch)
  const [bust, setBust] = useState<number>(0);

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
      setTenantName(display);

      setLoading(false);
    } catch {
      setLoading(false);
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

  return (
    <div className="flex items-center justify-between gap-4">
      {/* Tenant Name: same visual weight as title "LeadRadar Admin" */}
      <div className="min-w-0">
        <div className="truncate text-base font-semibold text-slate-900">{loading ? "…" : tenantName}</div>
      </div>

      {/* Logo: bigger, no frame, right aligned */}
      <div className={styles.topbarWrap} aria-label="Tenant Logo">
        {logoOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            alt=""
            className={styles.topbarImg}
            onError={() => setLogoOk(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
