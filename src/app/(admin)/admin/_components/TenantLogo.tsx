"use client";

import * as React from "react";
import styles from "./TenantLogo.module.css";

type Props = {
  variant: "topbar" | "settings";
  className?: string;
  tenantSlug?: string | null; // optional fallback (not primary)
};

const LS_KEY = "lr_branding_logo_version_v1";

function readTenantSlugFallback(fallback?: string | null): string | null {
  const fromProp = typeof fallback === "string" ? fallback.trim() : "";
  if (fromProp) return fromProp;

  if (typeof document === "undefined") return null;
  const fromDom = (document.documentElement.dataset.lrTenantSlug ?? "").trim();
  return fromDom || null;
}

function extractTenantFromCurrent(json: any): { id: string | null; slug: string | null } {
  // We accept a few shapes to be resilient:
  // 1) { ok:true, data:{ tenant:{ id, slug } } }
  // 2) { ok:true, data:{ id, slug } }
  // 3) { tenant:{ id, slug } }
  const tenant = json?.data?.tenant ?? json?.tenant ?? null;
  const id = (tenant?.id ?? json?.data?.id ?? json?.id ?? null) as string | null;
  const slug = (tenant?.slug ?? json?.data?.slug ?? json?.slug ?? null) as string | null;

  return {
    id: typeof id === "string" && id.trim() ? id.trim() : null,
    slug: typeof slug === "string" && slug.trim() ? slug.trim() : null,
  };
}

export function TenantLogo({ variant, className, tenantSlug }: Props) {
  const [version, setVersion] = React.useState<string>(""); // hydration-safe
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [hasLogo, setHasLogo] = React.useState<boolean | null>(null);
  const [tenantId, setTenantId] = React.useState<string | null>(null);

  // Listen for Branding changes (cache-bust version)
  React.useEffect(() => {
    const init = () => {
      const v = window.localStorage.getItem(LS_KEY) ?? "";
      setVersion(v);
    };
    init();

    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY) setVersion(e.newValue ?? "");
    };
    const onCustom = () => {
      const v = window.localStorage.getItem(LS_KEY) ?? "";
      setVersion(v);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("lr:branding", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("lr:branding", onCustom as EventListener);
    };
  }, []);

  // Resolve tenantId via /tenants/current (best-effort, once)
  React.useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const res = await fetch("/api/admin/v1/tenants/current", {
          method: "GET",
          cache: "no-store",
        });
        if (!alive) return;

        if (!res.ok) {
          setTenantId(null);
          return;
        }

        const json = await res.json();
        const t = extractTenantFromCurrent(json);
        if (!alive) return;

        if (t.id) setTenantId(t.id);

        // optional: publish slug into DOM for other components
        if (t.slug) document.documentElement.dataset.lrTenantSlug = t.slug;
      } catch {
        if (!alive) return;
        setTenantId(null);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, []);

  // Fetch logo as blob (attach tenant header)
  React.useEffect(() => {
    let alive = true;

    const cleanup = () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };

    const run = async () => {
      const vParam = version ? encodeURIComponent(version) : "0";
      const url = `/api/admin/v1/tenants/current/logo?v=${vParam}`;

      // Prefer tenantId from /tenants/current
      const headers: Record<string, string> = {};
      if (tenantId) {
        headers["x-tenant-id"] = tenantId;
      } else {
        // fallback (older approach)
        const slug = readTenantSlugFallback(tenantSlug);
        if (slug) headers["x-tenant-slug"] = slug;
      }

      if (Object.keys(headers).length === 0) {
        cleanup();
        if (!alive) return;
        setBlobUrl(null);
        setHasLogo(false);
        return;
      }

      try {
        const res = await fetch(url, { method: "GET", headers });

        if (!alive) return;

        if (res.status === 404) {
          cleanup();
          setBlobUrl(null);
          setHasLogo(false);
          return;
        }

        if (!res.ok) {
          cleanup();
          setBlobUrl(null);
          setHasLogo(false);
          return;
        }

        const blob = await res.blob();
        if (!alive) return;

        cleanup();
        const nextUrl = URL.createObjectURL(blob);
        setBlobUrl(nextUrl);
        setHasLogo(true);
      } catch {
        if (!alive) return;
        cleanup();
        setBlobUrl(null);
        setHasLogo(false);
      }
    };

    run();

    return () => {
      alive = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, tenantId]);

  const maxH = variant === "topbar" ? 28 : 64;
  const frameH = variant === "topbar" ? 28 : 72;
  const frameW = variant === "topbar" ? 88 : 220;

  const showPlaceholder = hasLogo === false;

  return (
    <div
      className={[
        styles.frame,
        variant === "topbar" ? styles.topbar : styles.settings,
        className ?? "",
      ].join(" ")}
      style={{ height: frameH, width: frameW }}
      aria-label="Tenant logo"
    >
      {blobUrl ? (
        <img
          className={styles.img}
          src={blobUrl}
          alt="Logo"
          style={{ maxHeight: maxH, width: "auto", objectFit: "contain" }}
        />
      ) : null}

      {showPlaceholder ? <span className={styles.placeholder}>Logo</span> : null}
    </div>
  );
}
