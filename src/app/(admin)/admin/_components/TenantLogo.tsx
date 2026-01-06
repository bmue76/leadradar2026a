"use client";

import * as React from "react";
import styles from "./TenantLogo.module.css";

type Props = {
  variant: "topbar" | "settings";
  className?: string;
  tenantSlug?: string | null;
};

const LS_KEY = "lr_branding_logo_version_v1";

function readTenantRefFromDom(): string | null {
  if (typeof document === "undefined") return null;
  const v = (document.documentElement.dataset.lrTenantSlug ?? "").trim();
  return v || null;
}

function readTenantRef(prop?: string | null): string | null {
  const p = typeof prop === "string" ? prop.trim() : "";
  if (p) return p;
  return readTenantRefFromDom();
}

export function TenantLogo({ variant, className, tenantSlug }: Props) {
  const [version, setVersion] = React.useState<string>("");
  const [tenantRef, setTenantRef] = React.useState<string | null>(null);
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    const update = () => setTenantRef(readTenantRef(tenantSlug));
    update();

    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-lr-tenant-slug"],
    });

    return () => obs.disconnect();
  }, [tenantSlug]);

  React.useEffect(() => {
    const init = () => setVersion(window.localStorage.getItem(LS_KEY) ?? "");
    init();

    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY) setVersion(e.newValue ?? "");
    };
    const onCustom = () => setVersion(window.localStorage.getItem(LS_KEY) ?? "");

    window.addEventListener("storage", onStorage);
    window.addEventListener("lr:branding", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("lr:branding", onCustom as EventListener);
    };
  }, []);

  React.useEffect(() => {
    let alive = true;

    const cleanup = () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };

    const run = async () => {
      if (!tenantRef) {
        cleanup();
        if (!alive) return;
        setBlobUrl(null);
        return;
      }

      const vParam = version ? encodeURIComponent(version) : "0";
      const url = `/api/admin/v1/tenants/current/logo?v=${vParam}`;

      try {
        const res = await fetch(url, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });

        if (!alive) return;

        if (res.status === 404) {
          cleanup();
          setBlobUrl(null);
          return;
        }

        if (!res.ok) {
          cleanup();
          setBlobUrl(null);
          return;
        }

        const blob = await res.blob();
        if (!alive) return;

        cleanup();
        const nextUrl = URL.createObjectURL(blob);
        setBlobUrl(nextUrl);
      } catch {
        if (!alive) return;
        cleanup();
        setBlobUrl(null);
      }
    };

    void run();

    return () => {
      alive = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantRef, version]);

  if (variant === "topbar") {
    return (
      <div className={[styles.topbarWrap, className ?? ""].join(" ")} aria-label="Tenant logo">
        {blobUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.topbarImg} src={blobUrl} alt="Logo" style={{ maxHeight: 32, width: "auto" }} />
        ) : (
          <span className={styles.topbarPlaceholder}>Logo</span>
        )}
      </div>
    );
  }

  return (
    <div className={[styles.frame, className ?? ""].join(" ")} aria-label="Tenant logo">
      {blobUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.img} src={blobUrl} alt="Logo" style={{ maxHeight: 44, width: "auto", objectFit: "contain" }} />
      ) : (
        <span className={styles.placeholder}>Logo</span>
      )}
    </div>
  );
}
