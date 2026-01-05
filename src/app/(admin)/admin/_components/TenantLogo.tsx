"use client";

import * as React from "react";
import styles from "./TenantLogo.module.css";

type Props = {
  variant: "topbar" | "settings";
  className?: string;
  tenantSlug?: string | null; // can be slug OR id in dev/admin
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
  const [hasLogo, setHasLogo] = React.useState<boolean>(false);

  // keep tenantRef in sync with DOM + prop
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

  // Listen for branding version updates
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

  // Fetch logo ONLY when tenantRef exists; ALWAYS with header
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
        setHasLogo(false);
        return;
      }

      const vParam = version ? encodeURIComponent(version) : "0";
      const url = `/api/admin/v1/tenants/current/logo?v=${vParam}`;

      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { "x-tenant-slug": tenantRef },
          credentials: "same-origin",
          cache: "no-store",
        });

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
  }, [tenantRef, version]);

  const maxH = variant === "topbar" ? 28 : 64;
  const frameH = variant === "topbar" ? 28 : 72;
  const frameW = variant === "topbar" ? 88 : 220;

  return (
    <div
      className={[
        styles.frame,
        variant === "topbar" ? styles.topbar : styles.settings,
        className ?? "",
      ].join(" ")}
      style={{ height: frameH, width: frameW }}
      aria-label="Tenant logo"
      title={tenantRef ? `TenantRef: ${tenantRef}` : "TenantRef: —"}
    >
      {blobUrl ? (
        <img
          className={styles.img}
          src={blobUrl}
          alt="Logo"
          style={{ maxHeight: maxH, width: "auto", objectFit: "contain" }}
        />
      ) : (
        <span className={styles.placeholder}>Logo</span>
      )}
    </div>
  );
}
