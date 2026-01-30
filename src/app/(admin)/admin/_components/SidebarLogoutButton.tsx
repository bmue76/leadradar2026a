"use client";

import React, { useCallback, useState } from "react";

function IconLogout(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M3 12h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M7 8l-4 4 4 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SidebarLogoutButton() {
  const [busy, setBusy] = useState(false);

  const onLogout = useCallback(async () => {
    if (busy) return;
    setBusy(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        cache: "no-store",
      });
    } catch {
      // ignore: even if fetch fails, we still hard-navigate
    } finally {
      // Hard navigation = cleanest reset (cookies already expired by route)
      window.location.assign("/login");
    }
  }, [busy]);

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={busy}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
      aria-label="Abmelden"
    >
      <IconLogout className="size-4 text-slate-600" />
      <span>{busy ? "Abmelden…" : "Abmelden"}</span>
    </button>
  );
}
