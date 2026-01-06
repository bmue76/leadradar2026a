"use client";

import * as React from "react";
import Image from "next/image";
import styles from "./AdminShell.module.css";
import SidebarNav from "./SidebarNav";
import Topbar from "./Topbar";
import { TenantLogo } from "./TenantLogo";
import SidebarLogout from "./SidebarLogout";
import { adminFetchJson } from "../_lib/adminFetch";

type CurrentTenantDto = {
  tenant: {
    id: string;
    slug: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
};

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = React.useState(false);
  const [tenant, setTenant] = React.useState<CurrentTenantDto["tenant"] | null>(null);

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    let alive = true;

    const run = async () => {
      const res = await adminFetchJson<CurrentTenantDto>("/api/admin/v1/tenants/current", { method: "GET" });
      if (!alive) return;

      if (res.ok) {
        setTenant(res.data.tenant);
        return;
      }

      setTenant(null);
    };

    void run();

    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;

    const slug = (tenant?.slug ?? "").trim();
    if (slug) document.documentElement.dataset.lrTenantSlug = slug;
    else delete document.documentElement.dataset.lrTenantSlug;
  }, [hydrated, tenant?.slug]);

  const tenantName = hydrated ? (tenant?.name ?? "Tenant") : "Tenant";
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
              leftSlot={hydrated ? <TenantLogo variant="topbar" tenantSlug={tenant?.slug ?? null} /> : null}
            />
          </div>

          <div className={styles.content}>{children}</div>
        </main>
      </div>
    </div>
  );
}
