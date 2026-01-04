"use client";

import * as React from "react";
import styles from "./Topbar.module.css";

type TopbarProps = {
  title?: string;
  tenantSlug?: string | null;
  onToggleSidebar?: () => void;
  children?: React.ReactNode;
};

export default function Topbar({
  title,
  tenantSlug,
  onToggleSidebar,
  children,
}: TopbarProps) {
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  // IMPORTANT:
  // Show tenant pill only after hydration to avoid SSR/CSR mismatch
  const showTenant =
    hydrated && typeof tenantSlug === "string" && tenantSlug.trim().length > 0;

  return (
    <header className={styles.root}>
      <div className={styles.left}>
        {onToggleSidebar ? (
          <button
            type="button"
            className={styles.menuButton}
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
            title="Menu"
          >
            <span className={styles.menuIcon} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        ) : null}

        {title ? <div className={styles.title}>{title}</div> : null}
      </div>

      <div className={styles.right}>
        {showTenant ? (
          <div className={styles.tenantPill} title={`Tenant: ${tenantSlug}`}>
            {tenantSlug}
          </div>
        ) : null}

        {children ? <div className={styles.slot}>{children}</div> : null}
      </div>
    </header>
  );
}
