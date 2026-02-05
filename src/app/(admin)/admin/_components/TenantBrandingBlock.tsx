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

export default function TenantBrandingBlock() {
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState<string>("Tenant");

  const [logoOk, setLogoOk] = useState(false);
  const [logoTag, setLogoTag] = useState<string | null>(null);

  const logoSrc = useMemo(() => {
    if (!logoTag) return "/api/admin/v1/tenants/current/logo";
    return `/api/admin/v1/tenants/current/logo?v=${encodeURIComponent(logoTag)}`;
  }, [logoTag]);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const res = await fetch("/api/admin/v1/branding", { method: "GET", cache: "no-store" });
      const json = (await res.json()) as ApiResp<BrandingGetDto>;
      if (json.ok) {
        setName(pickTenantDisplayName(json.data));
      }
    } catch {
      // ignore
    }

    const tag = await fetchLogoVersionTag();
    setLogoTag(tag);
    setLogoOk(Boolean(tag));

    setLoading(false);
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
    <div className="flex min-w-0 items-center gap-3">
      <div className="h-8 w-8 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {logoOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc} alt="" className="h-full w-full object-contain" onError={() => setLogoOk(false)} />
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
