"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

function IconLogout(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M3 12h11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
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
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onLogout = useCallback(async () => {
    if (busy) return;
    setErr(null);
    setBusy(true);

    try {
      // Prefer POST (clears cookies in response)
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
      });

      // Some setups only implement GET -> fallback to navigation
      if (res.status === 405 || res.status === 404) {
        window.location.assign("/api/auth/logout");
        return;
      }

      if (!res.ok) {
        // Last fallback: hard navigation
        window.location.assign("/api/auth/logout");
        return;
      }

      router.push("/login");
      router.refresh();
    } catch {
      window.location.assign("/api/auth/logout");
    } finally {
      setBusy(false);
    }
  }, [busy, router]);

  return (
    <div>
      <button
        type="button"
        onClick={onLogout}
        disabled={busy}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        aria-label="Logout"
      >
        <IconLogout className="size-4 text-slate-600" />
        <span>{busy ? "Logout…" : "Logout"}</span>
      </button>

      {err ? <div className="mt-2 px-3 text-[11px] text-rose-700">{err}</div> : null}
    </div>
  );
}
