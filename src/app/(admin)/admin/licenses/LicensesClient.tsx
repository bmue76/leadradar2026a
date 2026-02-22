"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type DeviceItem = {
  id: string;
  name: string;
  lastSeenAt: string | null;
  activeLicense: null | { type: "FAIR_30D" | "YEAR_365D"; endsAt: string };
  pendingCount: number;
  pendingNextType: "FAIR_30D" | "YEAR_365D" | null;
};

type HistoryItem = {
  id: string;
  deviceId: string;
  deviceName: string;
  type: "FAIR_30D" | "YEAR_365D";
  status: "ACTIVE" | "REVOKED";
  state: "ACTIVE" | "EXPIRED" | "PENDING_ACTIVATION" | "REVOKED";
  startsAt: string;
  endsAt: string;
  createdAt: string;
  source: "STRIPE" | "MANUAL";
  note: string | null;
};

type LicensesResp = { now: string; devices: DeviceItem[]; history: HistoryItem[] };

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function chip(cls: string, label: string) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

function licenseChip(d: DeviceItem) {
  if (d.activeLicense) return chip("border-emerald-100 bg-emerald-50 text-emerald-700", `Aktiv · ${d.activeLicense.type}`);
  if (d.pendingCount > 0) {
    const t = d.pendingNextType ? ` · ${d.pendingNextType}` : "";
    const c = d.pendingCount > 1 ? ` (${d.pendingCount})` : "";
    return chip("border-amber-100 bg-amber-50 text-amber-800", `Gekauft · wartet auf Aktivierung${t}${c}`);
  }
  return chip("border-slate-200 bg-slate-50 text-slate-700", "Keine Lizenz");
}

function stateChip(s: HistoryItem["state"]) {
  if (s === "ACTIVE") return chip("border-emerald-100 bg-emerald-50 text-emerald-700", "Aktiv");
  if (s === "PENDING_ACTIVATION") return chip("border-amber-100 bg-amber-50 text-amber-800", "Wartet");
  if (s === "EXPIRED") return chip("border-slate-200 bg-slate-50 text-slate-700", "Abgelaufen");
  return chip("border-rose-200 bg-rose-50 text-rose-700", "Widerrufen");
}

function Button({
  label,
  kind,
  onClick,
  disabled,
}: {
  label: string;
  kind: "primary" | "secondary";
  onClick: () => void;
  disabled?: boolean;
}) {
  const base =
    "inline-flex h-9 items-center justify-center rounded-xl px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200";
  const cls =
    kind === "primary"
      ? `${base} bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50`
      : `${base} border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 disabled:opacity-50`;
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-900 hover:bg-slate-50"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Popover({
  label,
  children,
}: {
  label: React.ReactNode;
  children: (ctx: { close: () => void }) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const el = t.closest("[data-popover-root]");
      if (!el) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" data-popover-root>
      <span
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {label}
      </span>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="p-1">{children({ close })}</div>
        </div>
      ) : null}
    </div>
  );
}

export default function LicensesClient() {
  const [data, setData] = useState<LicensesResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function pushNotice(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setTraceId(null);
    try {
      const res = await fetch("/api/admin/v1/licenses", { cache: "no-store" });
      const json = (await res.json()) as ApiResp<LicensesResp>;
      if (!json.ok) {
        setErr(json.error.message);
        setTraceId(json.traceId);
        setData(null);
      } else {
        setData(json.data);
      }
    } catch {
      setErr("Netzwerkfehler.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Stripe redirect UX
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const stripe = sp.get("stripe");
    if (stripe === "success") {
      pushNotice("Zahlung abgeschlossen. Synchronisiere Lizenz…");
      sp.delete("stripe");
      sp.delete("deviceId");
      window.history.replaceState({}, "", `${window.location.pathname}${sp.toString() ? `?${sp.toString()}` : ""}`);

      let i = 0;
      const t = window.setInterval(() => {
        i += 1;
        void load();
        if (i >= 8) window.clearInterval(t);
      }, 900);

      return () => window.clearInterval(t);
    }
    if (stripe === "cancel") {
      pushNotice("Zahlung abgebrochen.");
      sp.delete("stripe");
      sp.delete("deviceId");
      window.history.replaceState({}, "", `${window.location.pathname}${sp.toString() ? `?${sp.toString()}` : ""}`);
    }
    return;
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const startCheckout = useCallback(async (deviceId: string, type: "FAIR_30D" | "YEAR_365D") => {
    setErr(null);
    setTraceId(null);
    try {
      const res = await fetch(`/api/admin/v1/devices/${deviceId}/license/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const json = (await res.json()) as ApiResp<{ checkoutUrl: string }>;
      if (!json.ok) {
        setErr(json.error.message);
        setTraceId(json.traceId);
        return;
      }
      window.location.href = json.data.checkoutUrl;
    } catch {
      setErr("Netzwerkfehler.");
    }
  }, []);

  const devices = data?.devices ?? [];
  const history = data?.history ?? [];

  const historyCountLabel = useMemo(() => `${history.length} Einträge`, [history.length]);

  return (
    <div className="space-y-6">
      {notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      ) : null}

      {err ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {err}
          {traceId ? <div className="mt-1 text-xs text-rose-900/70">TraceId: {traceId}</div> : null}
          <div className="mt-3">
            <Button label="Retry" kind="secondary" onClick={load} />
          </div>
        </div>
      ) : null}

      {/* Status per device */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">Status pro Gerät</div>
            <div className="mt-0.5 text-xs text-slate-600">Kaufen/verlängern und Pending-Aktivierung sehen.</div>
          </div>
          <Button label="Aktualisieren" kind="secondary" onClick={load} disabled={loading} />
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-sm text-slate-600">Lade…</div>
          ) : devices.length === 0 ? (
            <div className="text-sm text-slate-600">Noch keine Geräte.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {devices.map((d) => (
                <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900">{d.name}</div>
                      <div className="mt-1 truncate font-mono text-xs text-slate-500">{d.id}</div>
                    </div>
                    <div className="flex items-center gap-2">{licenseChip(d)}</div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-500">Zuletzt gesehen</div>
                      <div className="mt-1 truncate text-sm text-slate-900">{formatDateTime(d.lastSeenAt)}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-500">Lizenz</div>
                      <div className="mt-1 truncate text-sm text-slate-900">
                        {d.activeLicense ? `Aktiv bis ${formatDateTime(d.activeLicense.endsAt)}` : d.pendingCount > 0 ? "Start bei App-Aktivierung" : "—"}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-500">Aktionen</div>
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        <Popover
                          label={
                            <button
                              type="button"
                              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
                            >
                              Kaufen / Verlängern
                            </button>
                          }
                        >
                          {({ close }) => (
                            <>
                              <MenuItem
                                label="30 Tage (FAIR_30D)"
                                onClick={() => {
                                  close();
                                  void startCheckout(d.id, "FAIR_30D");
                                }}
                              />
                              <MenuItem
                                label="365 Tage (YEAR_365D)"
                                onClick={() => {
                                  close();
                                  void startCheckout(d.id, "YEAR_365D");
                                }}
                              />
                            </>
                          )}
                        </Popover>

                        <Button
                          label="Geräte"
                          kind="secondary"
                          onClick={() => (window.location.href = "/admin/devices")}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* History */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">Historie</div>
            <div className="mt-0.5 text-xs text-slate-600">Alle gekauften/aktivierten Device-Lizenzen (neueste zuerst).</div>
          </div>
          <div className="text-xs text-slate-500">{historyCountLabel}</div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-sm text-slate-600">Lade…</div>
          ) : history.length === 0 ? (
            <div className="text-sm text-slate-600">Noch keine Lizenz-Historie.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-auto text-sm">
                <thead className="text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="py-2 text-left">Datum</th>
                    <th className="py-2 text-left">Gerät</th>
                    <th className="py-2 text-left">Typ</th>
                    <th className="py-2 text-left">Zeitraum</th>
                    <th className="py-2 text-left">Quelle</th>
                    <th className="py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((h) => {
                    const period =
                      h.state === "PENDING_ACTIVATION"
                        ? "Start bei Aktivierung"
                        : `${formatDateTime(h.startsAt)} → ${formatDateTime(h.endsAt)}`;

                    return (
                      <tr key={h.id} className="hover:bg-slate-50">
                        <td className="py-3 text-slate-700">{formatDateTime(h.createdAt)}</td>
                        <td className="py-3">
                          <div className="font-semibold text-slate-900">{h.deviceName}</div>
                          <div className="font-mono text-xs text-slate-500">{h.deviceId}</div>
                        </td>
                        <td className="py-3 text-slate-700">{h.type}</td>
                        <td className="py-3 text-slate-700">{period}</td>
                        <td className="py-3 text-slate-700">{h.source}</td>
                        <td className="py-3">{stateChip(h.state)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
