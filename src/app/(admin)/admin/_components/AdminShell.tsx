"use client";

import * as React from "react";
import Image from "next/image";
import styles from "./AdminShell.module.css";
import SidebarNav from "./SidebarNav";
import Topbar from "./Topbar";
import { TenantLogo } from "./TenantLogo";
import SidebarLogout from "./SidebarLogout";
import {
  TENANT_SLUG_STORAGE_KEY,
  getDefaultTenantSlug,
  getTenantSlugClient,
} from "../_lib/adminFetch";

function subscribeTenantSlug(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (e: StorageEvent) => {
    if (e.key === TENANT_SLUG_STORAGE_KEY) onStoreChange();
  };

  const onCustom = () => onStoreChange();

  window.addEventListener("storage", onStorage);
  window.addEventListener("lr_admin_tenant_slug_changed", onCustom as EventListener);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("lr_admin_tenant_slug_changed", onCustom as EventListener);
  };
}

function displayNameFromTenantRef(ref: string): string {
  const r = ref.trim().toLowerCase();
  if (r === "atlex") return "Atlex GmbH";
  if (r === "demo" || r === "tenant_demo") return "Demo AG";
  return ref;
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  const tenantSlug = React.useSyncExternalStore(
    subscribeTenantSlug,
    () => getTenantSlugClient() || getDefaultTenantSlug(), // client snapshot
    () => getDefaultTenantSlug() // server snapshot
  );

  const tenantHeaderRef = (tenantSlug ?? "").trim();

  // Publish tenant header ref into DOM (BrandingClient + TenantLogo read it).
  // Only after hydration, so initial SSR markup stays stable.
  React.useEffect(() => {
    if (!hydrated) return;

    if (tenantHeaderRef) {
      document.documentElement.dataset.lrTenantSlug = tenantHeaderRef;
    } else {
      delete document.documentElement.dataset.lrTenantSlug;
    }
  }, [hydrated, tenantHeaderRef]);

  // Avoid hydration mismatch: title is neutral until hydrated.
  const tenantName = hydrated && tenantHeaderRef ? displayNameFromTenantRef(tenantHeaderRef) : "Tenant";
  const title = `${tenantName} - Admin`;

  return (
    <div className={styles.root}>
      <div className={styles.shell}>
        <aside className={[styles.sidebar, styles.sidebarOpen].join(" ")}>
          <div className={styles.sidebarHeader}>
            <div className={styles.brandRow}>
              <div className={styles.logo} aria-hidden="true">
                <Image src="/brand/leadradar-icon.png" alt="" width={28} height={28} priority />
              </div>

              <div className={styles.brandText}>
                <div className={styles.brandTitle}>LEADRADAR</div>
                <div className={styles.brandSub}>Admin Console</div>
              </div>
            </div>
          </div>

          <div className={styles.sidebarContent}>
            <SidebarNav onNavigate={() => {}} />
            <SidebarLogout />
          </div>
        </aside>

        <main className={styles.main}>
          <div className={styles.topbar}>
            <Topbar
              title={title}
              rightSlot={hydrated ? <TenantLogo variant="topbar" /> : null}
            />
          </div>

          <div className={styles.content}>{children}</div>
        </main>
      </div>
    </div>
  );
}
