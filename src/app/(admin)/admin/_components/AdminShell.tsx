"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./AdminShell.module.css";
import SidebarNav from "./SidebarNav";
import Topbar from "./Topbar";
import { getDefaultTenantSlug, getTenantSlugClient } from "../_lib/adminFetch";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Avoid hydration mismatch: start with env default, then read localStorage on client
  const [tenantSlug, setTenantSlug] = useState(getDefaultTenantSlug());

  useEffect(() => {
    setTenantSlug(getTenantSlugClient());
  }, []);

  const title = useMemo(() => "LeadRadar Admin", []);

  return (
    <div className={styles.root}>
      {sidebarOpen ? (
        <div
          className={styles.scrim}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <div className={styles.shell}>
        <aside className={[styles.sidebar, sidebarOpen ? styles.sidebarOpen : ""].join(" ")}>
          <div className={styles.sidebarHeader}>
            <div className={styles.brandRow}>
              <div className={styles.logo} aria-hidden="true" />
              <div className={styles.brandText}>
                <div className={styles.brandTitle}>LeadRadar</div>
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
            <div className={styles.topbarLeft}>
              {/* Hamburger is handled in Topbar (mobile), but keep spacing consistent */}
            </div>
          </div>

          {/* Real Topbar content */}
          <div className={styles.topbar} style={{ marginTop: -56 }}>
            <div className={styles.topbarLeft}>
              {/* placeholder for alignment */}
            </div>
          </div>

          <div className={styles.topbar} style={{ marginTop: -56, padding: 0, borderBottom: "none", background: "transparent" }}>
            <div style={{ width: "100%" }}>
              <Topbar
                title={title}
                tenantSlug={tenantSlug}
                onToggleSidebar={() => setSidebarOpen((v) => !v)}
                onTenantSlugChange={(next) => setTenantSlug(next)}
              />
            </div>
          </div>

          <div className={styles.content}>{children}</div>
        </main>
      </div>

      {/* Lightly defensive: close sidebar on resize to desktop */}
      <style>{`
        @media (min-width: 901px){
          /* no-op; sidebar is always visible on desktop */
        }
      `}</style>
    </div>
  );
}
