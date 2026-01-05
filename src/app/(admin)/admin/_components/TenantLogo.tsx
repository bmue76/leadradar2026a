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

function readTenantRefFromPropOrDom(prop?: string | null): string | null {
  const p = typeof prop === "string" ? prop.trim() : "";
  if (p) return p;
  return readTenantRefFromDom();
}

async function tryFetchLogoBlob(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, {
    method: "GET",
    credentials: "same-origin",
    headers: headers ?? undefined,
    cache: "no-store",
  });

  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  const isJson = ct.includes("application/json");

  if (!res.ok) {
    let msg: string | null = null;
    if (isJson) {
      try {
        const j = await res.json();
        msg = j?.error?.message ?? null;
      } catch {
        // ignore
      }
    }
    return { ok: false as const, status: res.status, msg };
  }

  // When ok, we expect binary image. If server accidentally returns JSON, treat as not ok.
  if (isJson) {
    let msg: string | null = null;
    try {
      const j = await res.json();
      msg = j?.error?.message ?? null;
    } catch {
      // ignore
    }
    return { ok: false as const, status: 500, msg: msg ?? "Unexpected JSON response." };
  }

  const blob = await res.blob();
  return { ok: true as const, status: res.status, blob };
}

export function TenantLogo({ variant, className, tenantSlug }: Props) {
  const [version, setVersion] = React.useState<string>(""); // hydration-safe
  const [tenantRef, setTenantRef] = React.useState<string | null>(null);
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);
  const [hasLogo, setHasLogo] = React.useState<boolean | null>(null);

  // Track tenantRef from prop + DOM dataset (Topbar writes it after hydration)
  React.useEffect(() => {
    const init = () => setTenantRef(readTenantRefFromPropOrDom(tenantSlug));
    init();

    const obs = new MutationObserver(() => {
      setTenantRef(readTenantRefFromPropOrDom(tenantSlug));
    });

    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-lr-tenant-slug"] });

    return () => obs.disconnect();
  }, [tenantSlug]);

  // Listen for Branding changes (cache-bust)
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

  // Fetch logo as blob with a robust fallback strategy
  React.useEffect(() => {
    let alive = true;

    const cleanup = () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };

    const run = async () => {
      const vParam = version ? encodeURIComponent(version) : "0";
      const url = `/api/admin/v1/tenants/current/logo?v=${vParam}`;

      // 1) Try WITHOUT tenant headers (best case: middleware injects x-tenant-id)
      try {
        const r1 = await tryFetchLogoBlob(url);
        if (!alive) return;

        if (r1.ok) {
          cleanup();
          const next = URL.createObjectURL(r1.blob);
          setBlobUrl(next);
          setHasLogo(true);
          return;
        }

        // If still failing: 404 can mean "no logo" OR "tenant not found" depending on context.
        // We fallback once with tenantRef if available.
      } catch {
        // ignore, continue fallback
      }

      // 2) Fallback WITH tenantRef
      if (!tenantRef) {
        cleanup();
        if (!alive) return;
        setBlobUrl(null);
        setHasLogo(false);
        return;
      }

      try {
        const r2 = await tryFetchLogoBlob(url, { "x-tenant-slug": tenantRef });
        if (!alive) return;

        if (r2.ok) {
          cleanup();
          const next = URL.createObjectURL(r2.blob);
          setBlobUrl(next);
          setHasLogo(true);
          return;
        }

        // If 404 -> treat as "no logo"
        cleanup();
        setBlobUrl(null);
        setHasLogo(false);
      } catch {
        cleanup();
        if (!alive) return;
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
  }, [version, tenantRef]);

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
