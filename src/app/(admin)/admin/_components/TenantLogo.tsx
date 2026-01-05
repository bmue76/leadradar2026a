"use client";

import * as React from "react";
import styles from "./TenantLogo.module.css";

type Props = {
  variant: "topbar" | "settings";
  className?: string;
};

const LS_KEY = "lr_branding_logo_version_v1";

export function TenantLogo({ variant, className }: Props) {
  const [version, setVersion] = React.useState<string>(""); // hydration-safe: same on SSR/CSR first paint
  const [hasLogo, setHasLogo] = React.useState<boolean | null>(null);

  // react to updates from BrandingClient (same tab via custom event, other tabs via storage)
  React.useEffect(() => {
    const init = () => {
      const v = window.localStorage.getItem(LS_KEY) ?? "";
      setVersion(v);
      setHasLogo(null);
    };
    init();

    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY) {
        setVersion(e.newValue ?? "");
        setHasLogo(null);
      }
    };
    const onCustom = () => {
      const v = window.localStorage.getItem(LS_KEY) ?? "";
      setVersion(v);
      setHasLogo(null);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("lr:branding", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("lr:branding", onCustom as EventListener);
    };
  }, []);

  const maxH = variant === "topbar" ? 28 : 64;
  const frameH = variant === "topbar" ? 28 : 72;
  const frameW = variant === "topbar" ? 88 : 220;

  const vParam = version ? encodeURIComponent(version) : "0";
  const src = `/api/admin/v1/tenants/current/logo?v=${vParam}`;

  const showPlaceholder = hasLogo === false;
  const showImg = hasLogo !== false; // null (unknown) => try loading image

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
      {showImg ? (
        <img
          className={styles.img}
          src={src}
          alt="Logo"
          style={{ maxHeight: maxH, width: "auto", objectFit: "contain" }}
          onLoad={() => setHasLogo(true)}
          onError={() => setHasLogo(false)}
        />
      ) : null}

      {showPlaceholder ? <span className={styles.placeholder}>Logo</span> : null}
    </div>
  );
}
