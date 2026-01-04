"use client";

import { useEffect, useRef, useState } from "react";

type MeOk = {
  ok: true;
  data: { user: { id: string; email: string; name: string | null; role: string } };
  traceId: string;
};
type MeErr = {
  ok: false;
  error: { code: string; message: string };
  traceId: string;
};

export default function UserMenu() {
  const [label, setLabel] = useState<string>("…");
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { method: "GET" });
        const json = (await res.json()) as MeOk | MeErr;
        if (!mounted) return;
        if (res.ok && json.ok) {
          const u = json.data.user;
          setLabel(u.name?.trim() ? u.name : u.email);
        } else {
          setLabel("Account");
        }
      } catch {
        setLabel("Account");
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function onLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
        aria-label="User menu"
      >
        <span className="max-w-[220px] truncate">{ready ? label : "…"}</span>
        <span className="text-gray-400">▾</span>
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}
