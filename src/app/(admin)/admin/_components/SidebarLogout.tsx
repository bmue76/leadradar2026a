"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import styles from "./SidebarLogout.module.css";

export default function SidebarLogout() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const onLogout = async () => {
    setBusy(true);
    setErr(null);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch {
      setErr("Logout fehlgeschlagen.");
    } finally {
      // Always go to login; proxy-guard will enforce it anyway
      router.push("/login");
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.btn}
        onClick={onLogout}
        disabled={busy}
      >
        Logout
      </button>
      {err ? <div className={styles.err}>{err}</div> : null}
    </div>
  );
}
