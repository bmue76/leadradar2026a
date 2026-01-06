"use client";

import * as React from "react";
import styles from "./TenantLogo.module.css";

type Props = {
  variant: "topbar" | "settings";
  className?: string;
  tenantSlug?: string | null; // optional explicit override (DEV only) – not used by default
};

const LS_KEY = "lr_branding_logo_version_v1";

export function TenantLogo({ variant, className }: Props) {
  const [version, setVersion] = React.useState<string>("");
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);

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

    run();

    return () => {
      alive = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  if (variant === "topbar") {
    return (
      <div className={[styles.topbarWrap, className ?? ""].join(" ")} aria-label="Tenant logo">
        {blobUrl ? (
          <img className={styles.topbarImg} src={blobUrl} alt="Logo" />
        ) : (
          <span className={styles.topbarPlaceholder}>Logo</span>
        )}
      </div>
    );
  }

  return (
    <div className={[styles.frame, className ?? ""].join(" ")} aria-label="Tenant logo">
      {blobUrl ? (
        <img className={styles.img} src={blobUrl} alt="Logo" />
      ) : (
        <span className={styles.placeholder}>Logo</span>
      )}
    </div>
  );
}
