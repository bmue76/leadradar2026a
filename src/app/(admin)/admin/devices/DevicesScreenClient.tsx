"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "../_components/ConfirmDialog";
import DeviceSetupDrawer from "./DeviceSetupDrawer";
import DeviceUpsertDialog from "./DeviceUpsertDialog";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type ApiKeyInfo = { prefix: string; status: "ACTIVE" | "REVOKED"; revokedAt: string | null };
type ActiveEventInfo = null | { id: string; name: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED" };
type ActiveLicenseInfo = null | { type: "FAIR_30D" | "YEAR_365D"; endsAt: string };

type DeviceRow = {
  id: string;
  name: string;
  status: "CONNECTED" | "STALE" | "NEVER";
  lastSeenAt: string | null;
  createdAt: string;
  activeEvent: ActiveEventInfo;
  apiKey: ApiKeyInfo;
  activeLicense: ActiveLicenseInfo;
  pendingLicenseCount: number;
  pendingNextType: "FAIR_30D" | "YEAR_365D" | null;
};

type DevicesList = { items: DeviceRow[] };

const EMPTY_ITEMS: DeviceRow[] = [];

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusChip(s: DeviceRow["status"]) {
  const cls =
    s === "CONNECTED"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : s === "STALE"
        ? "bg-amber-50 text-amber-800 border-amber-100"
        : "bg-slate-50 text-slate-700 border-slate-200";
  const label = s === "CONNECTED" ? "Online" : s === "STALE" ? "Stale" : "Nie";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function licenseChip(active: ActiveLicenseInfo, pendingCount: number, pendingNextType: DeviceRow["pendingNextType"]) {
  if (active) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        Aktiv · {active.type}
      </span>
    );
  }
  if (pendingCount > 0) {
    const t = pendingNextType ? ` · ${pendingNextType}` : "";
    const c = pendingCount > 1 ? ` (${pendingCount})` : "";
    return (
      <span className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
        Gekauft · wartet auf Aktivierung{t}{c}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
      Keine Lizenz
    </span>
  );
}

function Button({
  label,
  kind,
  onClick,
  disabled,
}: {
  label: string;
  kind: "primary" | "secondary" | "danger";
  onClick: () => void;
  disabled?: boolean;
}) {
  const base =
    "inline-flex h-9 items-center justify-center rounded-xl px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200";
  const cls =
    kind === "primary"
      ? `${base} bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50`
      : kind === "danger"
        ? `${base} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 disabled:opacity-50`
        : `${base} border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 disabled:opacity-50`;

  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

function IconButton({ title, onClick, disabled }: { title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
      aria-label={title}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      ↻
    </button>
  );
}

function MenuItem({ label, onClick, tone }: { label: string; onClick: () => void; tone?: "danger" }) {
  const cls =
    tone === "danger"
      ? "w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50"
      : "w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-900 hover:bg-slate-50";
  return (
    <button type="button" className={cls} onClick={onClick}>
      {label}
    </button>
  );
}

function Popover({
  label,
  children,
  align = "right",
}: {
  label: React.ReactNode;
  children: (ctx: { close: () => void }) => React.ReactNode;
  align?: "right" | "left";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onDocDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (rootRef.current && t && rootRef.current.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="relative" ref={rootRef}>
      <span
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {label}
      </span>

      {open ? (
        <div
          className={`absolute z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="p-1">{children({ close })}</div>
        </div>
      ) : null}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm text-slate-900">{value}</div>
    </div>
  );
}

type ConfirmState = null | {
  deviceId: string;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  tone: "danger" | "primary";
};

export default function DevicesScreenClient() {
  const [data, setData] = useState<DevicesList | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [q, setQ] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDevice, setDrawerDevice] = useState<null | {
    id: string;
    name: string;
    license: { active: ActiveLicenseInfo; pendingCount: number; pendingNextType: DeviceRow["pendingNextType"] };
  }>(null);

  const [upsert, setUpsert] = useState<
    | null
    | { mode: "create" }
    | { mode: "rename"; deviceId: string; initialName: string }
  >(null);

  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  function pushNotice(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setTraceId(null);
    try {
      const url = new URL("/api/admin/v1/devices", window.location.origin);
      if (q.trim()) url.searchParams.set("q", q.trim());
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json()) as ApiResp<DevicesList>;
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
  }, [q]);

  // Stripe success UX: show banner and auto-refresh a few times
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

  const handleDrawerChanged = useCallback(() => {
    void load();
  }, [load]);

  const openSetup = useCallback((d: DeviceRow) => {
    setDrawerDevice({
      id: d.id,
      name: d.name,
      license: { active: d.activeLicense, pendingCount: d.pendingLicenseCount, pendingNextType: d.pendingNextType },
    });
    setDrawerOpen(true);
  }, []);

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

  const openDeleteConfirm = useCallback((d: DeviceRow) => {
    const eventLabel = d.activeEvent ? `"${d.activeEvent.name}"` : "—";
    setConfirm({
      deviceId: d.id,
      title: "Gerät löschen?",
      description: (
        <div className="space-y-2">
          <div className="text-slate-900">
            <span className="font-semibold">{d.name}</span>
            <span className="text-slate-500"> · {d.id}</span>
          </div>
          <div className="text-sm text-slate-600">
            Gebundenes Event: <span className="font-semibold text-slate-900">{eventLabel}</span>
          </div>
          <div className="text-xs text-slate-500">Gerät bleibt für Historie gespeichert (soft delete). API-Key wird widerrufen.</div>
        </div>
      ),
      confirmLabel: "Löschen",
      tone: "danger",
    });
  }, []);

  const doDeleteConfirmed = useCallback(async () => {
    if (!confirm) return;

    setConfirmBusy(true);
    setErr(null);
    setTraceId(null);

    try {
      const res = await fetch(`/api/admin/v1/devices/${confirm.deviceId}`, { method: "DELETE" });
      const json = (await res.json()) as ApiResp<{ deleted: true; id: string; revokedApiKey: boolean }>;

      if (!json.ok) {
        setErr(json.error.message);
        setTraceId(json.traceId);
        setConfirmBusy(false);
        return;
      }

      setConfirm(null);
      setConfirmBusy(false);
      pushNotice(json.data.revokedApiKey ? "Gerät gelöscht · API-Key widerrufen." : "Gerät gelöscht.");
      await load();
    } catch {
      setErr("Netzwerkfehler.");
      setConfirmBusy(false);
    }
  }, [confirm, load]);

  const items = data?.items ?? EMPTY_ITEMS;
  const filteredCount = useMemo(() => items.length, [items]);

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel ?? "OK"}
        tone={confirm?.tone ?? "primary"}
        busy={confirmBusy}
        onCancel={() => (confirmBusy ? null : setConfirm(null))}
        onConfirm={doDeleteConfirmed}
      />

      {drawerDevice ? (
        <DeviceSetupDrawer
          open={drawerOpen}
          deviceId={drawerDevice.id}
          deviceName={drawerDevice.name}
          license={drawerDevice.license}
          onClose={() => setDrawerOpen(false)}
          onChanged={handleDrawerChanged}
        />
      ) : null}

      <DeviceUpsertDialog
        open={upsert !== null}
        mode={upsert?.mode === "rename" ? "rename" : "create"}
        deviceId={upsert?.mode === "rename" ? upsert.deviceId : undefined}
        initialName={upsert?.mode === "rename" ? upsert.initialName : ""}
        onClose={() => setUpsert(null)}
        onDone={() => void load()}
      />

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Suchen…"
              className="h-9 w-[280px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />

            <IconButton title="Aktualisieren" onClick={load} disabled={loading} />

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-500">{filteredCount} Gerät(e)</span>
              <Button label="Gerät hinzufügen" kind="primary" onClick={() => setUpsert({ mode: "create" })} />
            </div>
          </div>

          {notice ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {notice}
            </div>
          ) : null}

          {err ? (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {err}
              {traceId ? <div className="mt-1 text-xs text-rose-900/70">TraceId: {traceId}</div> : null}
            </div>
          ) : null}
        </div>

        <div className="h-px w-full bg-slate-200" />

        <div className="p-6 pt-5">
          {loading ? (
            <div className="text-sm text-slate-600">Lade…</div>
          ) : !data ? (
            <div className="text-sm font-semibold text-slate-900">Keine Daten.</div>
          ) : items.length === 0 ? (
            <div className="py-4 text-sm text-slate-600">Noch keine Geräte.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {items.map((d) => {
                const licenseEndsLabel =
                  d.activeLicense ? `bis ${formatDateTime(d.activeLicense.endsAt)}` : d.pendingLicenseCount > 0 ? "Startet bei App-Aktivierung" : "—";

                return (
                  <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-slate-900">{d.name}</div>
                        <div className="mt-1 truncate font-mono text-xs text-slate-500">{d.id}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        {statusChip(d.status)}
                        {licenseChip(d.activeLicense, d.pendingLicenseCount, d.pendingNextType)}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <InfoLine label="Event" value={d.activeEvent ? d.activeEvent.name : "—"} />
                      <InfoLine label="Zuletzt gesehen" value={formatDateTime(d.lastSeenAt)} />
                      <InfoLine label="Lizenz" value={licenseEndsLabel} />
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                      <Button label="Gerät einrichten" kind="secondary" onClick={() => openSetup(d)} />

                      <Popover
                        label={
                          <button
                            type="button"
                            className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
                          >
                            Lizenz
                          </button>
                        }
                      >
                        {({ close }) => (
                          <>
                            <MenuItem
                              label={d.activeLicense ? "30 Tage verlängern" : "30 Tage kaufen"}
                              onClick={() => {
                                close();
                                void startCheckout(d.id, "FAIR_30D");
                              }}
                            />
                            <MenuItem
                              label={d.activeLicense ? "365 Tage verlängern" : "365 Tage kaufen"}
                              onClick={() => {
                                close();
                                void startCheckout(d.id, "YEAR_365D");
                              }}
                            />
                          </>
                        )}
                      </Popover>

                      <Popover
                        label={
                          <button
                            type="button"
                            className="inline-flex h-9 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-900 hover:bg-slate-50"
                            aria-label="Mehr"
                            title="Mehr"
                          >
                            …
                          </button>
                        }
                      >
                        {({ close }) => (
                          <>
                            <MenuItem
                              label="Umbenennen"
                              onClick={() => {
                                close();
                                setUpsert({ mode: "rename", deviceId: d.id, initialName: d.name });
                              }}
                            />
                            <MenuItem
                              label="Löschen"
                              tone="danger"
                              onClick={() => {
                                close();
                                openDeleteConfirm(d);
                              }}
                            />
                          </>
                        )}
                      </Popover>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
