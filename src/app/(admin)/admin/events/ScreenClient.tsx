"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type EventStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
type StatusFilter = "ALL" | EventStatus;
type SortKey = "updatedAt" | "startsAt" | "name";
type SortDir = "asc" | "desc";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type EventListItem = {
  id: string;
  name: string;
  status: EventStatus;
  startsAt?: string;
  endsAt?: string;
  location?: string;
  updatedAt: string;

  // optional counts (enabled via includeCounts=true)
  leadsCount?: number;
  assignedFormsCount?: number;
  boundDevicesCount?: number;
  canDelete?: boolean;
};

type EventUpsertPayload = {
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
};

type DrawerMode = "create" | "edit";

type DraftEvent = {
  id?: string;
  name: string;
  startsAt: string; // "" => null
  endsAt: string; // "" => null
  location: string; // "" => null
  status?: EventStatus;

  leadsCount?: number;
  assignedFormsCount?: number;
  boundDevicesCount?: number;
  canDelete?: boolean;
};

type ConfirmKind = "activate" | "archive" | "delete";

type ConfirmState =
  | null
  | {
      kind: ConfirmKind;
      id: string;
      name: string;
      status: EventStatus;
      leadsCount: number | null;
      assignedFormsCount: number | null;
      boundDevicesCount: number | null;
    };

function classNames(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function makeEmptyDraft(): DraftEvent {
  return { name: "", startsAt: "", endsAt: "", location: "" };
}

function isoDayToCH(iso?: string): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function formatRange(startsAt?: string, endsAt?: string): string {
  const s = startsAt ? isoDayToCH(startsAt) : null;
  const e = endsAt ? isoDayToCH(endsAt) : null;

  if (s && e) return `${s} – ${e}`;
  if (s) return `ab ${s}`;
  if (e) return `bis ${e}`;
  return "—";
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // de-CH gives dd.mm.yyyy; keep time for "Updated"
  return d.toLocaleString("de-CH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(s: EventStatus): string {
  if (s === "ACTIVE") return "Aktiv";
  if (s === "ARCHIVED") return "Archiviert";
  return "Entwurf";
}

function statusChipClass(s: EventStatus): string {
  if (s === "ACTIVE") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (s === "ARCHIVED") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function getCountsSafe(e: Pick<EventListItem, "leadsCount" | "assignedFormsCount" | "boundDevicesCount">) {
  const leads = typeof e.leadsCount === "number" ? e.leadsCount : null;
  const forms = typeof e.assignedFormsCount === "number" ? e.assignedFormsCount : null;
  const devices = typeof e.boundDevicesCount === "number" ? e.boundDevicesCount : null;
  return { leads, forms, devices };
}

function computeCanDelete(status: EventStatus, leads: number | null, forms: number | null, devices: number | null): boolean {
  if (status === "ACTIVE") return false;
  if (leads === null || forms === null || devices === null) return false;
  return leads === 0 && forms === 0 && devices === 0;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<ApiResp<T>> {
  const method = (init?.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(init?.headers ? (init.headers as Record<string, string>) : {}),
  };
  if (method !== "GET" && method !== "HEAD") headers["content-type"] = "application/json";

  const res = await fetch(input, { ...init, headers });
  const text = await res.text();
  try {
    return JSON.parse(text) as ApiResp<T>;
  } catch {
    return {
      ok: false,
      error: { code: "BAD_JSON", message: "Invalid JSON response." },
      traceId: res.headers.get("x-trace-id") || "—",
    };
  }
}

function Toast({ message, tone, onClose }: { message: string; tone: "success" | "danger"; onClose: () => void }) {
  return (
    <div
      className={classNames(
        "mb-4 rounded-2xl border px-4 py-3 text-sm",
        tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-800"
      )}
      role="status"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">{message}</div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-white/60"
          aria-label="Schliessen"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  tone,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  tone: "primary" | "danger";
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="Schliessen"
        onClick={() => {
          if (!busy) onCancel();
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="p-5">
            <div className="text-base font-semibold text-slate-900">{title}</div>
            <div className="mt-2 whitespace-pre-line text-sm text-slate-700">{message}</div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
            <button
              type="button"
              className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
              onClick={onCancel}
              disabled={busy}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className={classNames(
                "h-9 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50",
                tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : "bg-slate-900 hover:bg-slate-800"
              )}
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? "Bitte warten…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScreenClient() {
  // Defaults per TP decision: Sort by Startdatum (not Updated)
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [q, setQ] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("startsAt");
  const [dir, setDir] = useState<SortDir>("desc");

  const [items, setItems] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);

  const [toast, setToast] = useState<{ tone: "success" | "danger"; message: string } | null>(null);

  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [draft, setDraft] = useState<DraftEvent>(makeEmptyDraft());
  const [saving, setSaving] = useState<boolean>(false);

  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [confirmBusy, setConfirmBusy] = useState<boolean>(false);

  const debounceRef = useRef<number | null>(null);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    sp.set("status", status);
    sp.set("sort", sort);
    sp.set("dir", dir);
    sp.set("limit", "200");
    sp.set("includeCounts", "true");
    return sp.toString();
  }, [q, status, sort, dir]);

  const hasActiveFilters = useMemo(() => {
    return status !== "ALL" || !!q.trim() || sort !== "startsAt" || dir !== "desc";
  }, [status, q, sort, dir]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setTraceId(null);

    const r = await fetchJson<{ items: EventListItem[] }>(`/api/admin/v1/events?${queryString}`, { method: "GET" });
    if (!r.ok) {
      setErr(r.error.message);
      setTraceId(r.traceId);
      setItems([]);
      setLoading(false);
      return;
    }

    setItems(r.data.items);
    setLoading(false);
  }, [queryString]);

  const reloadAll = useCallback(async () => {
    await loadList();
  }, [loadList]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void loadList();
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [loadList]);

  const openCreate = useCallback(() => {
    setDrawerMode("create");
    setDraft(makeEmptyDraft());
    setDrawerOpen(true);
  }, []);

  const openEdit = useCallback((e: EventListItem) => {
    setDrawerMode("edit");
    setDraft({
      id: e.id,
      name: e.name,
      startsAt: e.startsAt ?? "",
      endsAt: e.endsAt ?? "",
      location: e.location ?? "",
      status: e.status,
      leadsCount: e.leadsCount,
      assignedFormsCount: e.assignedFormsCount,
      boundDevicesCount: e.boundDevicesCount,
      canDelete: e.canDelete,
    });
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    if (saving) return;
    setDrawerOpen(false);
  }, [saving]);

  const toPayload = useCallback((): EventUpsertPayload => {
    const name = draft.name.trim();
    const startsAt = draft.startsAt ? draft.startsAt : null;
    const endsAt = draft.endsAt ? draft.endsAt : null;
    const locTrim = draft.location.trim();
    const location = locTrim ? locTrim : null;
    return { name, startsAt, endsAt, location };
  }, [draft]);

  const pushToast = useCallback((tone: "success" | "danger", message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const doSave = useCallback(async () => {
    const name = draft.name.trim();
    if (!name) {
      pushToast("danger", "Bitte einen Namen erfassen.");
      return;
    }

    setSaving(true);
    const payload = toPayload();

    if (drawerMode === "create") {
      const r = await fetchJson<{ item: EventListItem }>(`/api/admin/v1/events`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        pushToast("danger", `${r.error.message}${r.traceId ? ` · Trace: ${r.traceId}` : ""}`);
        setSaving(false);
        return;
      }

      setDrawerOpen(false);
      setSaving(false);
      await reloadAll();
      pushToast("success", "Event erstellt.");
      return;
    }

    if (!draft.id) {
      setSaving(false);
      return;
    }

    const r = await fetchJson<{ item: EventListItem }>(`/api/admin/v1/events/${draft.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      pushToast("danger", `${r.error.message}${r.traceId ? ` · Trace: ${r.traceId}` : ""}`);
      setSaving(false);
      return;
    }

    setDrawerOpen(false);
    setSaving(false);
    await reloadAll();
    pushToast("success", "Event gespeichert.");
  }, [draft, drawerMode, pushToast, reloadAll, toPayload]);

  const requestConfirm = useCallback((c: ConfirmState) => {
    setConfirm(c);
  }, []);

  const closeConfirm = useCallback(() => {
    if (confirmBusy) return;
    setConfirm(null);
  }, [confirmBusy]);

  const runConfirmedAction = useCallback(async () => {
    if (!confirm) return;

    setConfirmBusy(true);
    setErr(null);
    setTraceId(null);

    try {
      if (confirm.kind === "activate") {
        const r = await fetchJson<{ ok: true }>(`/api/admin/v1/events/${confirm.id}/activate`, { method: "POST" });
        if (!r.ok) {
          pushToast("danger", `${r.error.message}${r.traceId ? ` · Trace: ${r.traceId}` : ""}`);
          setConfirmBusy(false);
          return;
        }
        await reloadAll();
        pushToast("success", "Event aktiviert.");
        setConfirm(null);
        setConfirmBusy(false);
        return;
      }

      if (confirm.kind === "archive") {
        const r = await fetchJson<{ ok: true }>(`/api/admin/v1/events/${confirm.id}/archive`, { method: "POST" });
        if (!r.ok) {
          pushToast("danger", `${r.error.message}${r.traceId ? ` · Trace: ${r.traceId}` : ""}`);
          setConfirmBusy(false);
          return;
        }
        await reloadAll();
        pushToast("success", "Event archiviert.");
        setConfirm(null);
        setConfirmBusy(false);
        return;
      }

      // delete
      const r = await fetchJson<{ ok: true }>(`/api/admin/v1/events/${confirm.id}`, { method: "DELETE" });
      if (!r.ok) {
        pushToast("danger", `${r.error.message}${r.traceId ? ` · Trace: ${r.traceId}` : ""}`);
        setConfirmBusy(false);
        return;
      }

      setDrawerOpen(false);
      await reloadAll();
      pushToast("success", "Event gelöscht.");
      setConfirm(null);
      setConfirmBusy(false);
    } catch {
      pushToast("danger", "Netzwerkfehler.");
      setConfirmBusy(false);
    }
  }, [confirm, pushToast, reloadAll]);

  const doActivate = useCallback(
    (e: EventListItem) => {
      requestConfirm({
        kind: "activate",
        id: e.id,
        name: e.name,
        status: e.status,
        ...(() => {
          const c = getCountsSafe(e);
          return { leadsCount: c.leads, assignedFormsCount: c.forms, boundDevicesCount: c.devices };
        })(),
      });
    },
    [requestConfirm]
  );

  const doArchive = useCallback(
    (e: EventListItem) => {
      requestConfirm({
        kind: "archive",
        id: e.id,
        name: e.name,
        status: e.status,
        ...(() => {
          const c = getCountsSafe(e);
          return { leadsCount: c.leads, assignedFormsCount: c.forms, boundDevicesCount: c.devices };
        })(),
      });
    },
    [requestConfirm]
  );

  const doDelete = useCallback(
    (e: EventListItem) => {
      const c = getCountsSafe(e);
      const deletable = computeCanDelete(e.status, c.leads, c.forms, c.devices);

      requestConfirm({
        kind: "delete",
        id: e.id,
        name: e.name,
        status: e.status,
        leadsCount: c.leads,
        assignedFormsCount: c.forms,
        boundDevicesCount: c.devices,
      });

      // If not deletable, keep UX strict: user can still see dialog text but confirm will be disabled (handled below).
      // We encode that via counts/status and derive in dialog render.
      void deletable;
    },
    [requestConfirm]
  );

  const resetFilters = useCallback(() => {
    setStatus("ALL");
    setQ("");
    setSort("startsAt");
    setDir("desc");
  }, []);

  const confirmUi = useMemo(() => {
    if (!confirm) return null;

    if (confirm.kind === "activate") {
      return {
        title: "Event aktivieren",
        tone: "primary" as const,
        confirmLabel: "Aktivieren",
        message: `„${confirm.name}“ wird aktiv gesetzt.\n\nMehrere Events können aktiv sein.`,
        canConfirm: true,
      };
    }

    if (confirm.kind === "archive") {
      return {
        title: "Event archivieren",
        tone: "primary" as const,
        confirmLabel: "Archivieren",
        message: `„${confirm.name}“ wird archiviert.\n\nArchivierte Events können in der App nicht mehr verwendet werden.`,
        canConfirm: true,
      };
    }

    const leads = confirm.leadsCount;
    const forms = confirm.assignedFormsCount;
    const devices = confirm.boundDevicesCount;

    const deletable = computeCanDelete(confirm.status, leads, forms, devices);

    const countsLine =
      leads === null || forms === null || devices === null
        ? "Nutzungsdaten werden geladen…"
        : `Leads: ${leads} · Formulare: ${forms} · Geräte: ${devices}`;

    const reason =
      confirm.status === "ACTIVE"
        ? "Aktive Events können nicht gelöscht werden."
        : !deletable
          ? "Löschen ist nur möglich, wenn das Event nie genutzt wurde."
          : null;

    return {
      title: "Event löschen",
      tone: "danger" as const,
      confirmLabel: "Löschen",
      message: `„${confirm.name}“ wirklich löschen?\n\n${countsLine}${reason ? `\n\n${reason}` : ""}`,
      canConfirm: deletable,
    };
  }, [confirm]);

  return (
    <>
      {toast ? <Toast tone={toast.tone} message={toast.message} onClose={() => setToast(null)} /> : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* Toolbar */}
        <div className="p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {(["ALL", "DRAFT", "ACTIVE", "ARCHIVED"] as const).map((s) => {
                const label = s === "ALL" ? "Alle" : statusLabel(s);
                const isOn = status === s;
                return (
                  <button
                    key={s}
                    className={classNames(
                      "h-9 rounded-full px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-slate-200",
                      isOn ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    )}
                    onClick={() => setStatus(s)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                onClick={() => void reloadAll()}
                aria-label="Refresh"
                title="Refresh"
              >
                ↻
              </button>

              {hasActiveFilters ? (
                <button
                  className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  onClick={resetFilters}
                >
                  Reset
                </button>
              ) : null}

              <button
                className="h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
                onClick={openCreate}
              >
                Neues Event
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Suche (Name/Ort)…"
              className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-200 md:w-[320px]"
            />

            <div className="flex items-center gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              >
                <option value="startsAt">Sort: Startdatum</option>
                <option value="updatedAt">Sort: Updated</option>
                <option value="name">Sort: Name</option>
              </select>

              <select
                value={dir}
                onChange={(e) => setDir(e.target.value as SortDir)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              >
                <option value="desc">↓ desc</option>
                <option value="asc">↑ asc</option>
              </select>
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-slate-200" />

        {/* Table */}
        <div className="bg-white">
          <div className="grid grid-cols-12 gap-3 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-600">
            <div className="col-span-4">Name</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-3">Zeitraum</div>
            <div className="col-span-2">Ort</div>
            <div className="col-span-1 text-right">Updated</div>
          </div>

          {loading ? (
            <div className="p-5">
              <div className="h-10 rounded-xl bg-slate-100" />
              <div className="mt-2 h-10 rounded-xl bg-slate-100" />
              <div className="mt-2 h-10 rounded-xl bg-slate-100" />
            </div>
          ) : err ? (
            <div className="p-5">
              <div className="text-sm font-semibold text-slate-900">Fehler</div>
              <div className="mt-1 text-sm text-slate-700">{err}</div>
              {traceId ? <div className="mt-2 text-xs text-slate-500">Trace: {traceId}</div> : null}
              <button
                className="mt-3 h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
                onClick={() => void reloadAll()}
              >
                Erneut versuchen
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="p-5">
              <div className="text-sm font-semibold text-slate-900">Keine Events</div>
              <div className="mt-1 text-sm text-slate-600">Lege dein erstes Event an. Danach kannst du es aktiv setzen.</div>
              <button
                className="mt-4 h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
                onClick={openCreate}
              >
                Neues Event
              </button>
            </div>
          ) : (
            <div>
              {items.map((e) => {
                const canActivate = e.status !== "ACTIVE" && e.status !== "ARCHIVED";
                const canArchive = e.status !== "ARCHIVED";
                const counts = getCountsSafe(e);
                const deletable = typeof e.canDelete === "boolean" ? e.canDelete : computeCanDelete(e.status, counts.leads, counts.forms, counts.devices);

                return (
                  <div
                    key={e.id}
                    className="group grid cursor-pointer grid-cols-12 gap-3 px-5 py-3 text-sm hover:bg-slate-50"
                    onClick={() => openEdit(e)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") openEdit(e);
                    }}
                  >
                    <div className="col-span-4 font-semibold text-slate-900">{e.name}</div>

                    <div className="col-span-2">
                      <span
                        className={classNames(
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                          statusChipClass(e.status)
                        )}
                      >
                        {statusLabel(e.status)}
                      </span>
                    </div>

                    <div className="col-span-3 text-slate-700">{formatRange(e.startsAt, e.endsAt)}</div>
                    <div className="col-span-2 truncate text-slate-700">{e.location ?? "—"}</div>

                    <div className="col-span-1 text-right text-xs text-slate-500">{formatUpdated(e.updatedAt)}</div>

                    {/* Hover Actions */}
                    <div className="col-span-12 mt-2 hidden items-center gap-2 group-hover:flex">
                      {canActivate ? (
                        <button
                          className="h-9 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            doActivate(e);
                          }}
                        >
                          Aktivieren
                        </button>
                      ) : null}

                      {canArchive ? (
                        <button
                          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            doArchive(e);
                          }}
                        >
                          Archivieren
                        </button>
                      ) : null}

                      <button
                        className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openEdit(e);
                        }}
                      >
                        Bearbeiten
                      </button>

                      <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-1">
                          Leads: {counts.leads ?? "—"}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-1">
                          Formulare: {counts.forms ?? "—"}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-1">
                          Geräte: {counts.devices ?? "—"}
                        </span>

                        <button
                          className={classNames(
                            "h-9 rounded-xl px-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-slate-200",
                            deletable
                              ? "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                              : "cursor-not-allowed border border-slate-200 bg-slate-50 text-slate-400"
                          )}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            doDelete(e);
                          }}
                          disabled={!deletable}
                          title={deletable ? "Event löschen" : "Löschen nur möglich, wenn das Event nie genutzt wurde."}
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={closeDrawer} />
          <div className="absolute right-0 top-0 h-full w-full max-w-[520px] bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-5">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {drawerMode === "create" ? "Neues Event" : "Event bearbeiten"}
                </div>
                <div className="mt-1 text-sm text-slate-600">Name, Zeitraum und Ort sind für die Zuordnung relevant.</div>
              </div>
              <button
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                onClick={closeDrawer}
              >
                Schliessen
              </button>
            </div>

            <div className="p-5">
              <label className="block text-xs font-semibold text-slate-600">Name</label>
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="z. B. Swissbau 2026"
                className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
              />

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600">Start</label>
                  <input
                    type="date"
                    value={draft.startsAt}
                    onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))}
                    className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600">Ende</label>
                  <input
                    type="date"
                    value={draft.endsAt}
                    onChange={(e) => setDraft((d) => ({ ...d, endsAt: e.target.value }))}
                    className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-semibold text-slate-600">Ort (optional)</label>
                <input
                  value={draft.location}
                  onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                  placeholder="z. B. Basel"
                  className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              {drawerMode === "edit" ? (
                <>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="text-xs font-semibold text-slate-600">Status</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={classNames(
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                          statusChipClass(draft.status || "DRAFT")
                        )}
                      >
                        {statusLabel(draft.status || "DRAFT")}
                      </span>
                      <span className="text-xs text-slate-500">Mehrere Events können aktiv sein.</span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {draft.status !== "ACTIVE" && draft.status !== "ARCHIVED" && draft.id ? (
                        <button
                          className="h-9 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                          onClick={() => {
                            const e: EventListItem = {
                              id: draft.id!,
                              name: draft.name,
                              status: draft.status || "DRAFT",
                              startsAt: draft.startsAt || undefined,
                              endsAt: draft.endsAt || undefined,
                              location: draft.location || undefined,
                              updatedAt: new Date().toISOString(),
                              leadsCount: draft.leadsCount,
                              assignedFormsCount: draft.assignedFormsCount,
                              boundDevicesCount: draft.boundDevicesCount,
                              canDelete: draft.canDelete,
                            };
                            doActivate(e);
                          }}
                          disabled={saving}
                        >
                          Aktiv setzen
                        </button>
                      ) : null}

                      {draft.status !== "ARCHIVED" && draft.id ? (
                        <button
                          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                          onClick={() => {
                            const e: EventListItem = {
                              id: draft.id!,
                              name: draft.name,
                              status: draft.status || "DRAFT",
                              startsAt: draft.startsAt || undefined,
                              endsAt: draft.endsAt || undefined,
                              location: draft.location || undefined,
                              updatedAt: new Date().toISOString(),
                              leadsCount: draft.leadsCount,
                              assignedFormsCount: draft.assignedFormsCount,
                              boundDevicesCount: draft.boundDevicesCount,
                              canDelete: draft.canDelete,
                            };
                            doArchive(e);
                          }}
                          disabled={saving}
                        >
                          Archivieren
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Delete */}
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-slate-600">Löschen</div>
                        <div className="mt-1 text-sm text-slate-700">
                          Nur möglich, wenn das Event nie genutzt wurde.
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          Leads: {typeof draft.leadsCount === "number" ? draft.leadsCount : "—"} · Formulare:{" "}
                          {typeof draft.assignedFormsCount === "number" ? draft.assignedFormsCount : "—"} · Geräte:{" "}
                          {typeof draft.boundDevicesCount === "number" ? draft.boundDevicesCount : "—"}
                        </div>
                      </div>

                      {draft.id ? (
                        (() => {
                          const leads = typeof draft.leadsCount === "number" ? draft.leadsCount : null;
                          const forms = typeof draft.assignedFormsCount === "number" ? draft.assignedFormsCount : null;
                          const devices = typeof draft.boundDevicesCount === "number" ? draft.boundDevicesCount : null;
                          const statusNow = draft.status || "DRAFT";
                          const deletable = computeCanDelete(statusNow, leads, forms, devices);

                          return (
                            <button
                              className={classNames(
                                "h-9 rounded-xl px-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50",
                                deletable ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-slate-100 text-slate-400"
                              )}
                              onClick={() => {
                                const e: EventListItem = {
                                  id: draft.id!,
                                  name: draft.name,
                                  status: statusNow,
                                  startsAt: draft.startsAt || undefined,
                                  endsAt: draft.endsAt || undefined,
                                  location: draft.location || undefined,
                                  updatedAt: new Date().toISOString(),
                                  leadsCount: draft.leadsCount,
                                  assignedFormsCount: draft.assignedFormsCount,
                                  boundDevicesCount: draft.boundDevicesCount,
                                  canDelete: draft.canDelete,
                                };
                                doDelete(e);
                              }}
                              disabled={!deletable || saving}
                              title={
                                deletable
                                  ? "Event löschen"
                                  : statusNow === "ACTIVE"
                                    ? "Aktive Events können nicht gelöscht werden."
                                    : "Löschen nur möglich, wenn das Event nie genutzt wurde."
                              }
                            >
                              Löschen
                            </button>
                          );
                        })()
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                  onClick={closeDrawer}
                  disabled={saving}
                >
                  Abbrechen
                </button>
                <button
                  className="h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                  onClick={() => void doSave()}
                  disabled={saving}
                >
                  {saving ? "Speichern…" : "Speichern"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!confirmUi}
        title={confirmUi?.title ?? ""}
        message={confirmUi?.message ?? ""}
        confirmLabel={confirmUi?.confirmLabel ?? ""}
        tone={confirmUi?.tone ?? "primary"}
        busy={confirmBusy}
        onCancel={closeConfirm}
        onConfirm={() => {
          if (!confirmUi?.canConfirm) return;
          void runConfirmedAction();
        }}
      />
    </>
  );
}
