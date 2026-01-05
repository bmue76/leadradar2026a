"use client";

import * as React from "react";
import styles from "./TenantLogo.module.css";

type Props = {
  variant: "topbar" | "settings";
  className?: string;
  tenantSlug?: string | null;
};

const LS_KEY = "lr_branding_logo_version_v1";

function readTenantSlug(fallback?: string | null): string | null {
  const fromProp = typeof fallback === "string" ? fallback.trim() : "";
  if (fromProp) return fromProp;

  if (typeof document === "undefined") return null;
  const fromDom = (document.documentElement.dataset.lrTenantSlug ?? "").trim();
  return fromDom || null;
}

export function TenantLogo({ variant, className, tenantSlug }: Props) {
  const [version, setVersion] = React.useState<string>(""); // hydration-safe
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [hasLogo, setHasLogo] = React.useState<boolean | null>(null);

  // Listen for Branding changes
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

  // Fetch logo as blob (so we can attach tenant header)
  React.useEffect(() => {
    let alive = true;

    const cleanup = () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };

    const run = async () => {
      const slug = readTenantSlug(tenantSlug);
      if (!slug) {
        cleanup();
        if (!alive) return;
        setBlobUrl(null);
        setHasLogo(false);
        return;
      }

      const vParam = version ? encodeURIComponent(version) : "0";
      const url = `/api/admin/v1/tenants/current/logo?v=${vParam}`;

      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { "x-tenant-slug": slug },
        });

        if (!alive) return;

        if (res.status === 404) {
          cleanup();
          setBlobUrl(null);
          setHasLogo(false);
          return;
        }

        if (!res.ok) {
          // 401/403 etc -> treat as not available
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
  }, [version, tenantSlug, variant]);

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
