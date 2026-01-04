"use client";

import * as React from "react";
import Image from "next/image";
import styles from "./AdminShell.module.css";
import SidebarNav from "./SidebarNav";
import Topbar from "./Topbar";
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

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const tenantSlug = React.useSyncExternalStore(
    subscribeTenantSlug,
    () => getTenantSlugClient() || getDefaultTenantSlug(), // ✅ hydration-safe
    () => getDefaultTenantSlug()
  );

  const title = "LEADRADAR Admin";

  return (
    <div className={styles.root}>
      {sidebarOpen ? (
        <div className={styles.scrim} onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      ) : null}

      <div className={styles.shell}>
        <aside className={[styles.sidebar, sidebarOpen ? styles.sidebarOpen : ""].join(" ")}>
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
            <SidebarNav onNavigate={() => setSidebarOpen(false)} />
          </div>
        </aside>

        <main className={styles.main}>
          <div className={styles.topbar}>
            <Topbar
              key={tenantSlug || "tenant"}
              title={title}
              tenantSlug={tenantSlug}
              onToggleSidebar={() => setSidebarOpen((v) => !v)}
            />
          </div>

          <div className={styles.content}>{children}</div>
        </main>
      </div>
    </div>
  );
}
