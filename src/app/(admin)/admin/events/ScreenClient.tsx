"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog, { DialogState } from "./_components/ConfirmDialog";

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
};

type ActiveOverviewApi = {
  activeEvent: null | {
    id: string;
    name: string;
    status: "ACTIVE";
    startsAt?: string;
    endsAt?: string;
    location?: string;
  };
  counts: { assignedActiveForms: number; boundDevices: number };
  actions: { href: string; label: string }[];
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
};

function classNames(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function makeEmptyDraft(): DraftEvent {
  return { name: "", startsAt: "", endsAt: "", location: "" };
}

// ---- Date helpers (dd.mm.yyyy) ----
function parseToDate(value?: string | null): Date | null {
  if (!value) return null;

  // If API returns YYYY-MM-DD (date-only), parse as LOCAL date to avoid TZ shifting.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  }

  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

const dmyFmt = new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });

function fmtDMY(value?: string | null): string {
  const dt = parseToDate(value);
  if (!dt) return "—";
  return dmyFmt.format(dt); // dd.mm.yyyy
}

function formatRangeDMY(startsAt?: string, endsAt?: string): string {
  const a = startsAt ? fmtDMY(startsAt) : "";
  const b = endsAt ? fmtDMY(endsAt) : "";
  if (a && b) return `${a} – ${b}`;
  if (a) return `ab ${a}`;
  if (b) return `bis ${b}`;
  return "—";
}

function normalizeToDateInput(value?: string): string {
  if (!value) return "";
  // ISO datetime -> YYYY-MM-DD
  if (value.includes("T")) return value.slice(0, 10);
  // already date-only
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return "";
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Updated bleibt inkl. Zeit (ist ok)
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

// ✅ ACTIVE grün
function statusChipClass(s: EventStatus): string {
  if (s === "ACTIVE") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (s === "ARCHIVED") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-slate-200 bg-slate-50 text-slate-700";
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

function readDeleteCounts(details: unknown): { forms?: number; devices?: number; leads?: number } {
  if (!isRecord(details)) return {};
  const counts = isRecord(details.counts) ? (details.counts as Record<string, unknown>) : null;

  const forms = counts && typeof counts.forms === "number" ? counts.forms : undefined;
  const devices = counts && typeof counts.devices === "number" ? counts.devices : undefined;
  const leads = counts && typeof counts.leads === "number" ? counts.leads : undefined;

  return { forms, devices, leads };
}

export default function ScreenClient() {
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [q, setQ] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("updatedAt");
  const [dir, setDir] = useState<SortDir>("desc");

  const [items, setItems] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);

  const [overview, setOverview] = useState<ActiveOverviewApi | null>(null);
  const [overviewLoading, setOverviewLoading] = useState<boolean>(true);

  // ✅ separate active list (shows ALL active events, independent of filters)
  const [activeItems, setActiveItems] = useState<EventListItem[]>([]);
  const [activeLoading, setActiveLoading] = useState<boolean>(true);

  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [draft, setDraft] = useState<DraftEvent>(makeEmptyDraft());

  // busy-state für Save / Activate / Archive / Delete
  const [busy, setBusy] = useState<null | "save" | "activate" | "archive" | "delete">(null);
  const isBusy = busy !== null;
  const isSaving = busy === "save";

  const debounceRef = useRef<number | null>(null);

  // Dialog (Confirm/Alert)
  const [dialog, setDialog] = useState<DialogState>({
    open: false,
    mode: "alert",
    tone: "default",
    title: "",
    message: "",
    confirmLabel: "OK",
    cancelLabel: "Abbrechen",
  });

  const dialogPromiseRef = useRef<null | { mode: "confirm" | "alert"; resolve: (v: any) => void }>(null);

  const closeDialog = useCallback((confirmed: boolean) => {
    const pending = dialogPromiseRef.current;
    dialogPromiseRef.current = null;
    setDialog((d) => ({ ...d, open: false }));

    if (!pending) return;

    if (pending.mode === "confirm") pending.resolve(confirmed);
    else pending.resolve(undefined);
  }, []);

  const showConfirm = useCallback(
    (opts: Omit<DialogState, "open" | "mode"> & { tone?: "default" | "danger" }) => {
      return new Promise<boolean>((resolve) => {
        dialogPromiseRef.current = { mode: "confirm", resolve };
        setDialog({
          open: true,
          mode: "confirm",
          tone: opts.tone ?? "default",
          title: opts.title,
          message: opts.message,
          confirmLabel: opts.confirmLabel ?? "Bestätigen",
          cancelLabel: opts.cancelLabel ?? "Abbrechen",
        });
      });
    },
    []
  );

  const showAlert = useCallback((opts: Omit<DialogState, "open" | "mode">) => {
    return new Promise<void>((resolve) => {
      dialogPromiseRef.current = { mode: "alert", resolve };
      setDialog({
        open: true,
        mode: "alert",
        tone: opts.tone ?? "default",
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? "OK",
        cancelLabel: opts.cancelLabel ?? "Schliessen",
      });
    });
  }, []);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    sp.set("status", status);
    sp.set("sort", sort);
    sp.set("dir", dir);
    return sp.toString();
  }, [q, status, sort, dir]);

  const hasActiveFilters = useMemo(() => {
    return status !== "ALL" || !!q.trim() || sort !== "updatedAt" || dir !== "desc";
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

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    const r = await fetchJson<ActiveOverviewApi>(`/api/admin/v1/events/active/overview`, { method: "GET" });
    if (!r.ok) {
      setOverview(null);
      setOverviewLoading(false);
      return;
    }
    setOverview(r.data);
    setOverviewLoading(false);
  }, []);

  const loadActiveList = useCallback(async () => {
    setActiveLoading(true);
    const sp = new URLSearchParams();
    sp.set("status", "ACTIVE");
    sp.set("sort", "updatedAt");
    sp.set("dir", "desc");
    sp.set("limit", "50");

    const r = await fetchJson<{ items: EventListItem[] }>(`/api/admin/v1/events?${sp.toString()}`, { method: "GET" });
    if (!r.ok) {
      setActiveItems([]);
      setActiveLoading(false);
      return;
    }
    setActiveItems(r.data.items);
    setActiveLoading(false);
  }, []);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadList(), loadOverview(), loadActiveList()]);
  }, [loadList, loadOverview, loadActiveList]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void loadList();
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [loadList]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadOverview();
      void loadActiveList();
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadOverview, loadActiveList]);

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
      startsAt: normalizeToDateInput(e.startsAt),
      endsAt: normalizeToDateInput(e.endsAt),
      location: e.location ?? "",
      status: e.status,
    });
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    if (isBusy) return;
    setDrawerOpen(false);
  }, [isBusy]);

  const toPayload = useCallback((): EventUpsertPayload => {
    const name = draft.name.trim();
    const startsAt = draft.startsAt ? draft.startsAt : null;
    const endsAt = draft.endsAt ? draft.endsAt : null;
    const locTrim = draft.location.trim();
    const location = locTrim ? locTrim : null;
    return { name, startsAt, endsAt, location };
  }, [draft]);

  const doSave = useCallback(async () => {
    const name = draft.name.trim();
    if (!name) {
      await showAlert({
        title: "Name fehlt",
        message: "Bitte einen Namen erfassen.",
        confirmLabel: "OK",
      });
      return;
    }

    setBusy("save");
    const payload = toPayload();

    if (drawerMode === "create") {
      const r = await fetchJson<{ item: EventListItem }>(`/api/admin/v1/events`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        await showAlert({
          title: "Fehler",
          message: (
            <div className="space-y-2">
              <div>{r.error.message}</div>
              <div className="text-xs text-slate-500">Trace: {r.traceId}</div>
            </div>
          ),
        });
        setBusy(null);
        return;
      }

      setDrawerOpen(false);
      setBusy(null);
      await reloadAll();
      return;
    }

    if (!draft.id) {
      setBusy(null);
      return;
    }

    const r = await fetchJson<{ item: EventListItem }>(`/api/admin/v1/events/${draft.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      await showAlert({
        title: "Fehler",
        message: (
          <div className="space-y-2">
            <div>{r.error.message}</div>
            <div className="text-xs text-slate-500">Trace: {r.traceId}</div>
          </div>
        ),
      });
      setBusy(null);
      return;
    }

    setDrawerOpen(false);
    setBusy(null);
    await reloadAll();
  }, [draft, drawerMode, reloadAll, showAlert, toPayload]);

  const doActivate = useCallback(
    async (id: string) => {
      const ok = await showConfirm({
        title: "Event aktivieren",
        message: (
          <div className="space-y-2">
            <div>Dieses Event wird aktiviert.</div>
            <div className="text-xs text-slate-500">Andere aktive Events bleiben aktiv.</div>
          </div>
        ),
        confirmLabel: "Aktivieren",
        cancelLabel: "Abbrechen",
        tone: "default",
      });
      if (!ok) return;

      setBusy("activate");

      const r = await fetchJson<{ ok: true }>(`/api/admin/v1/events/${id}/activate`, { method: "POST" });
      if (!r.ok) {
        await showAlert({
          title: "Fehler",
          message: (
            <div className="space-y-2">
              <div>{r.error.message}</div>
              <div className="text-xs text-slate-500">Trace: {r.traceId}</div>
            </div>
          ),
        });
        setBusy(null);
        return;
      }

      setBusy(null);
      await reloadAll();
    },
    [reloadAll, showAlert, showConfirm]
  );

  const doArchive = useCallback(
    async (id: string) => {
      const ok = await showConfirm({
        title: "Event archivieren",
        message: (
          <div className="space-y-2">
            <div>Archivierte Events können nicht mehr in der App verwendet werden.</div>
          </div>
        ),
        confirmLabel: "Archivieren",
        cancelLabel: "Abbrechen",
        tone: "default",
      });
      if (!ok) return;

      setBusy("archive");

      const r = await fetchJson<{ ok: true }>(`/api/admin/v1/events/${id}/archive`, { method: "POST" });
      if (!r.ok) {
        await showAlert({
          title: "Fehler",
          message: (
            <div className="space-y-2">
              <div>{r.error.message}</div>
              <div className="text-xs text-slate-500">Trace: {r.traceId}</div>
            </div>
          ),
        });
        setBusy(null);
        return;
      }

      setBusy(null);
      await reloadAll();
    },
    [reloadAll, showAlert, showConfirm]
  );

  const doDelete = useCallback(
    async (id: string, name: string) => {
      const ok = await showConfirm({
        title: "Event löschen",
        tone: "danger",
        message: (
          <div className="space-y-2">
            <div className="font-semibold text-slate-900">„{name}“</div>
            <div>Nur möglich, wenn das Event nie genutzt wurde:</div>
            <ul className="list-disc pl-5 text-sm text-slate-700">
              <li>keine Leads</li>
              <li>keine referenzierenden Formulare</li>
              <li>keine gebundenen Geräte</li>
            </ul>
          </div>
        ),
        confirmLabel: "Löschen",
        cancelLabel: "Abbrechen",
      });
      if (!ok) return;

      setBusy("delete");

      const r = await fetchJson<{ deleted: true; id: string }>(`/api/admin/v1/events/${id}`, { method: "DELETE" });

      if (!r.ok) {
        const info = readDeleteCounts(r.error.details);
        if (r.error.code === "EVENT_NOT_DELETABLE") {
          const parts: string[] = [];
          if (typeof info.forms === "number") parts.push(`Formulare: ${info.forms}`);
          if (typeof info.devices === "number") parts.push(`Geräte: ${info.devices}`);
          if (typeof info.leads === "number") parts.push(`Leads: ${info.leads}`);

          await showAlert({
            title: "Event kann nicht gelöscht werden",
            message: (
              <div className="space-y-2">
                <div>{r.error.message}</div>
                {parts.length ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <div className="text-xs font-semibold text-slate-600">Belegt durch</div>
                    <div className="mt-1 whitespace-pre-line">{parts.join("\n")}</div>
                  </div>
                ) : null}
                <div className="text-xs text-slate-500">Trace: {r.traceId}</div>
              </div>
            ),
          });
        } else {
          await showAlert({
            title: "Fehler",
            message: (
              <div className="space-y-2">
                <div>{r.error.message}</div>
                <div className="text-xs text-slate-500">Trace: {r.traceId}</div>
              </div>
            ),
          });
        }

        setBusy(null);
        return;
      }

      setDrawerOpen(false);
      setBusy(null);
      await reloadAll();
    },
    [reloadAll, showAlert, showConfirm]
  );

  const resetFilters = useCallback(() => {
    setStatus("ALL");
    setQ("");
    setSort("updatedAt");
    setDir("desc");
  }, []);

  const activeEventCard = useMemo(() => {
    if (overviewLoading || activeLoading) {
      return (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="p-5">
            <div className="h-4 w-40 rounded bg-slate-100" />
            <div className="mt-2 h-5 w-96 rounded bg-slate-100" />
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="h-16 rounded-2xl border border-slate-200 bg-white" />
              <div className="h-16 rounded-2xl border border-slate-200 bg-white" />
            </div>
          </div>
        </section>
      );
    }

    const counts = overview?.counts ?? { assignedActiveForms: 0, boundDevices: 0 };

    // ✅ Prefer activeItems list (can be >1)
    const list = activeItems.length
      ? activeItems
      : overview?.activeEvent
        ? [
            {
              id: overview.activeEvent.id,
              name: overview.activeEvent.name,
              status: "ACTIVE" as const,
              startsAt: overview.activeEvent.startsAt,
              endsAt: overview.activeEvent.endsAt,
              location: overview.activeEvent.location,
              updatedAt: new Date().toISOString(),
            },
          ]
        : [];

    if (list.length === 0) {
      return (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Aktive Events</div>
                <div className="mt-1 text-sm text-slate-600">Keine aktiven Events</div>
                <div className="mt-3 text-sm text-slate-600">Aktiviere ein Event, damit Formulare und Geräte korrekt zugeordnet sind.</div>
              </div>

              <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" onClick={openCreate}>
                Event anlegen
              </button>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Aktive Events</div>
              <div className="mt-1 text-sm text-slate-600">
                {list.length === 1 ? "1 aktives Event" : `${list.length} aktive Events`}
              </div>
            </div>

            <span className={classNames("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", statusChipClass("ACTIVE"))}>
              Aktiv · {list.length}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {list.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => openEdit(e)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50"
                title="Event bearbeiten"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">{e.name}</div>
                  <span className={classNames("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", statusChipClass("ACTIVE"))}>
                    Aktiv
                  </span>
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {formatRangeDMY(e.startsAt, e.endsAt)}
                  {e.location ? ` · ${e.location}` : ""}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-semibold text-slate-600">Formulare zugewiesen</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{counts.assignedActiveForms}</div>
              <div className="mt-3">
                <Link href="/admin/forms" className="text-sm font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-400">
                  Formulare öffnen
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-semibold text-slate-600">Geräte verbunden</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{counts.boundDevices}</div>
              <div className="mt-3">
                <Link href="/admin/devices" className="text-sm font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-400">
                  Geräte öffnen
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Hinweis: Es können mehrere Events aktiv sein. Die App arbeitet pro Gerät mit dem gebundenen Event (<span className="font-mono">activeEventId</span>).
          </div>
        </div>
      </section>
    );
  }, [overview, overviewLoading, activeItems, activeLoading, openCreate, openEdit]);

  return (
    <>
      {activeEventCard}

      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
                      "h-9 rounded-full px-3 text-sm font-semibold",
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
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                onClick={() => void reloadAll()}
                aria-label="Refresh"
                title="Refresh"
              >
                ↻
              </button>

              {hasActiveFilters ? (
                <button className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50" onClick={resetFilters}>
                  Reset
                </button>
              ) : null}

              <button className="h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800" onClick={openCreate}>
                Neues Event
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Suche (Name/Ort)…"
              className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300 md:w-[320px]"
            />

            <div className="flex items-center gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300"
              >
                <option value="updatedAt">Sort: Updated</option>
                <option value="startsAt">Sort: Startdatum</option>
                <option value="name">Sort: Name</option>
              </select>

              <select
                value={dir}
                onChange={(e) => setDir(e.target.value as SortDir)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300"
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
              <button className="mt-3 h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800" onClick={() => void reloadAll()}>
                Erneut versuchen
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="p-5">
              <div className="text-sm font-semibold text-slate-900">Keine Events</div>
              <div className="mt-1 text-sm text-slate-600">Lege dein erstes Event an. Danach kannst du es aktiv setzen.</div>
              <button className="mt-4 h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800" onClick={openCreate}>
                Neues Event
              </button>
            </div>
          ) : (
            <div>
              {items.map((e) => {
                const canActivate = e.status !== "ACTIVE" && e.status !== "ARCHIVED";
                const canArchive = e.status !== "ARCHIVED";
                const canDelete = e.status !== "ACTIVE";

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
                      <span className={classNames("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", statusChipClass(e.status))}>
                        {statusLabel(e.status)}
                      </span>
                    </div>

                    {/* ✅ Zeitraum dd.mm.yyyy */}
                    <div className="col-span-3 text-slate-700">{formatRangeDMY(e.startsAt, e.endsAt)}</div>
                    <div className="col-span-2 truncate text-slate-700">{e.location ?? "—"}</div>

                    <div className="col-span-1 text-right text-xs text-slate-500">{formatUpdated(e.updatedAt)}</div>

                    {/* Hover Actions */}
                    <div className="col-span-12 mt-2 hidden items-center gap-2 group-hover:flex">
                      {canActivate ? (
                        <button
                          className="h-9 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            void doActivate(e.id);
                          }}
                        >
                          Aktivieren
                        </button>
                      ) : null}

                      {canArchive ? (
                        <button
                          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            void doArchive(e.id);
                          }}
                        >
                          Archivieren
                        </button>
                      ) : null}

                      <button
                        className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openEdit(e);
                        }}
                      >
                        Bearbeiten
                      </button>

                      {canDelete ? (
                        <button
                          className="h-9 rounded-xl border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                          title="Löschen nur möglich, wenn Event nie genutzt wurde (keine Leads / Formulare / Geräte)."
                          onClick={(ev) => {
                            ev.stopPropagation();
                            void doDelete(e.id, e.name);
                          }}
                        >
                          Löschen
                        </button>
                      ) : null}
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
                <div className="text-sm font-semibold text-slate-900">{drawerMode === "create" ? "Neues Event" : "Event bearbeiten"}</div>
                <div className="mt-1 text-sm text-slate-600">Name, Zeitraum und Ort sind für die operative Zuordnung relevant.</div>
              </div>
              <button
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                onClick={closeDrawer}
                disabled={isBusy}
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
                className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300"
                disabled={isBusy}
              />

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600">Start</label>
                  <input
                    type="date"
                    value={draft.startsAt}
                    onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))}
                    className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300"
                    disabled={isBusy}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600">Ende</label>
                  <input
                    type="date"
                    value={draft.endsAt}
                    onChange={(e) => setDraft((d) => ({ ...d, endsAt: e.target.value }))}
                    className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300"
                    disabled={isBusy}
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-semibold text-slate-600">Ort (optional)</label>
                <input
                  value={draft.location}
                  onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                  placeholder="z. B. Basel"
                  className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300"
                  disabled={isBusy}
                />
              </div>

              {drawerMode === "edit" ? (
                <>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="text-xs font-semibold text-slate-600">Status</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={classNames("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", statusChipClass(draft.status || "DRAFT"))}>
                        {statusLabel(draft.status || "DRAFT")}
                      </span>
                      <span className="text-xs text-slate-500">Mehrere Events können aktiv sein. Geräte werden pro Gerät an ein Event gebunden (activeEventId).</span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {draft.status !== "ACTIVE" && draft.status !== "ARCHIVED" && draft.id ? (
                        <button
                          className="h-9 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          onClick={() => void doActivate(draft.id!)}
                          disabled={isBusy}
                        >
                          Aktiv setzen
                        </button>
                      ) : null}

                      {draft.status !== "ARCHIVED" && draft.id ? (
                        <button
                          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                          onClick={() => void doArchive(draft.id!)}
                          disabled={isBusy}
                        >
                          Archivieren
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Delete im Drawer */}
                  {draft.id ? (
                    <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-5">
                      <div className="text-xs font-semibold text-rose-900">Löschen</div>
                      <div className="mt-1 text-xs text-rose-800">
                        Nur möglich, wenn das Event nie genutzt wurde (keine Leads / keine referenzierenden Formulare / keine gebundenen Geräte).
                      </div>

                      {draft.status === "ACTIVE" ? (
                        <div className="mt-3 text-xs text-rose-800">Aktive Events können nicht gelöscht werden. Bitte zuerst archivieren.</div>
                      ) : (
                        <div className="mt-3">
                          <button
                            className="h-9 rounded-xl border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            onClick={() => void doDelete(draft.id!, draft.name)}
                            disabled={isBusy}
                          >
                            Event löschen
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                  onClick={closeDrawer}
                  disabled={isBusy}
                >
                  Abbrechen
                </button>
                <button
                  className="h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  onClick={() => void doSave()}
                  disabled={isBusy}
                >
                  {isSaving ? "Speichern…" : "Speichern"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Dialog (replaces window.alert/confirm) */}
      <ConfirmDialog {...dialog} onCancel={() => closeDialog(false)} onConfirm={() => closeDialog(true)} />
    </>
  );
}
