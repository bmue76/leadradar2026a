"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

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
  activeEvent: null | { id: string; name: string; status: "ACTIVE"; startsAt?: string; endsAt?: string; location?: string };
  counts: { assignedActiveForms: number; boundDevices: number };
  actions: { href: string; label: string }[];
};

type EventUpsertPayload = {
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
};

function classNames(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function formatRange(startsAt?: string, endsAt?: string): string {
  if (startsAt && endsAt) return `${startsAt} – ${endsAt}`;
  if (startsAt) return `ab ${startsAt}`;
  if (endsAt) return `bis ${endsAt}`;
  return "—";
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
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
  if (s === "ACTIVE") return "bg-black/5 text-black";
  if (s === "ARCHIVED") return "bg-black/5 text-black/60";
  return "bg-black/5 text-black/70";
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

type DrawerMode = "create" | "edit";

type DraftEvent = {
  id?: string;
  name: string;
  startsAt: string; // "" means null
  endsAt: string; // "" means null
  location: string; // "" means null
  status?: EventStatus;
};

function makeEmptyDraft(): DraftEvent {
  return { name: "", startsAt: "", endsAt: "", location: "" };
}

export default function EventsScreenClient() {
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

  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [draft, setDraft] = useState<DraftEvent>(makeEmptyDraft());
  const [saving, setSaving] = useState<boolean>(false);

  const debounceRef = useRef<number | null>(null);

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

  const reloadAll = useCallback(async () => {
    await Promise.all([loadList(), loadOverview()]);
  }, [loadList, loadOverview]);

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
    // Avoid setState directly in effect body (lint rule): run async in timer tick
    const t = window.setTimeout(() => {
      void loadOverview();
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadOverview]);

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

  const doSave = useCallback(async () => {
    const name = draft.name.trim();
    if (!name) {
      alert("Bitte einen Namen erfassen.");
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
        alert(`${r.error.message}\nTrace: ${r.traceId}`);
        setSaving(false);
        return;
      }

      setDrawerOpen(false);
      setSaving(false);
      await reloadAll();
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
      alert(`${r.error.message}\nTrace: ${r.traceId}`);
      setSaving(false);
      return;
    }

    setDrawerOpen(false);
    setSaving(false);
    await reloadAll();
  }, [draft, drawerMode, reloadAll, toPayload]);

  const doActivate = useCallback(
    async (id: string) => {
      const ok = window.confirm("Dieses Event wird das einzige aktive Event.\n\nFortfahren?");
      if (!ok) return;

      const r = await fetchJson<{ ok: true }>(`/api/admin/v1/events/${id}/activate`, { method: "POST" });
      if (!r.ok) {
        alert(`${r.error.message}\nTrace: ${r.traceId}`);
        return;
      }
      await reloadAll();
    },
    [reloadAll]
  );

  const doArchive = useCallback(
    async (id: string) => {
      const ok = window.confirm("Archivierte Events können nicht mehr in der App verwendet werden.\n\nFortfahren?");
      if (!ok) return;

      const r = await fetchJson<{ ok: true }>(`/api/admin/v1/events/${id}/archive`, { method: "POST" });
      if (!r.ok) {
        alert(`${r.error.message}\nTrace: ${r.traceId}`);
        return;
      }
      await reloadAll();
    },
    [reloadAll]
  );

  const resetFilters = useCallback(() => {
    setStatus("ALL");
    setQ("");
    setSort("updatedAt");
    setDir("desc");
  }, []);

  const activeCard = useMemo(() => {
    if (overviewLoading) {
      return (
        <div className="rounded-2xl border border-black/10 bg-white p-5">
          <div className="h-5 w-40 rounded bg-black/5" />
          <div className="mt-2 h-4 w-96 rounded bg-black/5" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="h-12 rounded-xl bg-black/5" />
            <div className="h-12 rounded-xl bg-black/5" />
          </div>
        </div>
      );
    }

    if (!overview || !overview.activeEvent) {
      return (
        <div className="rounded-2xl border border-black/10 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-black">Aktives Event</div>
              <div className="mt-1 text-sm text-black/60">Kein aktives Event</div>
              <div className="mt-3 text-sm text-black/60">
                Die App arbeitet immer mit dem aktiven Event. Aktiviere ein Event, damit Formulare/Geräte korrekt zugeordnet sind.
              </div>
            </div>
            <button
              className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90"
              onClick={() => window.scrollTo({ top: 380, behavior: "smooth" })}
            >
              Event aktivieren
            </button>
          </div>
        </div>
      );
    }

    const e = overview.activeEvent;
    return (
      <div className="rounded-2xl border border-black/10 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-black">Aktives Event</div>
            <div className="mt-1 text-base font-semibold text-black">{e.name}</div>
            <div className="mt-1 text-sm text-black/60">
              {formatRange(e.startsAt, e.endsAt)}
              {e.location ? ` · ${e.location}` : ""}
            </div>
          </div>
          <span className={classNames("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", statusChipClass("ACTIVE"))}>
            Aktiv
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="text-xs font-semibold text-black/60">Formulare zugewiesen</div>
            <div className="mt-1 text-2xl font-semibold text-black">{overview.counts.assignedActiveForms}</div>
            <div className="mt-3">
              <Link
                href="/admin/forms"
                className="text-sm font-semibold text-black underline decoration-black/20 underline-offset-4 hover:decoration-black/40"
              >
                Formulare öffnen
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="text-xs font-semibold text-black/60">Geräte verbunden</div>
            <div className="mt-1 text-2xl font-semibold text-black">{overview.counts.boundDevices}</div>
            <div className="mt-3">
              <Link
                href="/admin/devices"
                className="text-sm font-semibold text-black underline decoration-black/20 underline-offset-4 hover:decoration-black/40"
              >
                Geräte öffnen
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }, [overview, overviewLoading]);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-black">Events</h1>
          <p className="mt-1 text-sm text-black/60">Ein Event kann aktiv sein. Die App arbeitet immer mit dem aktiven Event.</p>
        </div>

        <button className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90" onClick={openCreate}>
          Neues Event
        </button>
      </div>

      <div className="mt-5">{activeCard}</div>

      <div className="mt-6 rounded-2xl border border-black/10 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {(["ALL", "DRAFT", "ACTIVE", "ARCHIVED"] as const).map((s) => {
              const label = s === "ALL" ? "Alle" : statusLabel(s);
              const isOn = status === s;
              return (
                <button
                  key={s}
                  className={classNames(
                    "rounded-full px-3 py-1.5 text-sm font-semibold",
                    isOn ? "bg-black text-white" : "bg-black/5 text-black hover:bg-black/10"
                  )}
                  onClick={() => setStatus(s)}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Suche (Name/Ort)…"
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black/20 md:w-[260px]"
            />

            <div className="flex items-center gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black/20"
              >
                <option value="updatedAt">Sort: Updated</option>
                <option value="startsAt">Sort: Startdatum</option>
                <option value="name">Sort: Name</option>
              </select>

              <select
                value={dir}
                onChange={(e) => setDir(e.target.value as SortDir)}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black/20"
              >
                <option value="desc">↓ desc</option>
                <option value="asc">↑ asc</option>
              </select>

              <button
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-black/5"
                onClick={() => void reloadAll()}
                aria-label="Refresh"
                title="Refresh"
              >
                ↻
              </button>

              {hasActiveFilters ? (
                <button
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-black/5"
                  onClick={resetFilters}
                >
                  Reset
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-black/10 bg-white">
        <div className="grid grid-cols-12 gap-3 border-b border-black/10 px-4 py-3 text-xs font-semibold text-black/60">
          <div className="col-span-4">Name</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-3">Zeitraum</div>
          <div className="col-span-2">Ort</div>
          <div className="col-span-1 text-right">Updated</div>
        </div>

        {loading ? (
          <div className="p-4">
            <div className="h-10 rounded-xl bg-black/5" />
            <div className="mt-2 h-10 rounded-xl bg-black/5" />
            <div className="mt-2 h-10 rounded-xl bg-black/5" />
          </div>
        ) : err ? (
          <div className="p-4">
            <div className="text-sm font-semibold text-black">Fehler</div>
            <div className="mt-1 text-sm text-black/70">{err}</div>
            {traceId ? <div className="mt-2 text-xs text-black/50">Trace: {traceId}</div> : null}
            <button className="mt-3 rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-black/90" onClick={() => void reloadAll()}>
              Erneut versuchen
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-6">
            <div className="text-sm font-semibold text-black">Keine Events</div>
            <div className="mt-1 text-sm text-black/60">Lege dein erstes Event an. Danach kannst du es aktiv setzen.</div>
            <button className="mt-4 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90" onClick={openCreate}>
              Neues Event
            </button>
          </div>
        ) : (
          <div>
            {items.map((e) => {
              const canActivate = e.status !== "ACTIVE" && e.status !== "ARCHIVED";
              const canArchive = e.status !== "ARCHIVED";

              return (
                <div
                  key={e.id}
                  className="group grid cursor-pointer grid-cols-12 gap-3 px-4 py-3 text-sm hover:bg-black/[0.03]"
                  onClick={() => openEdit(e)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") openEdit(e);
                  }}
                >
                  <div className="col-span-4 font-semibold text-black">{e.name}</div>

                  <div className="col-span-2">
                    <span className={classNames("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", statusChipClass(e.status))}>
                      {statusLabel(e.status)}
                    </span>
                  </div>

                  <div className="col-span-3 text-black/70">{formatRange(e.startsAt, e.endsAt)}</div>
                  <div className="col-span-2 truncate text-black/70">{e.location ?? "—"}</div>

                  <div className="col-span-1 text-right text-xs text-black/50">{formatUpdated(e.updatedAt)}</div>

                  <div className="col-span-12 mt-2 hidden items-center gap-2 group-hover:flex">
                    {canActivate ? (
                      <button
                        className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/90"
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
                        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-black/5"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          void doArchive(e.id);
                        }}
                      >
                        Archivieren
                      </button>
                    ) : null}

                    <button
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-black/5"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openEdit(e);
                      }}
                    >
                      Bearbeiten
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={closeDrawer} />
          <div className="absolute right-0 top-0 h-full w-full max-w-[520px] bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-black/10 p-5">
              <div>
                <div className="text-sm font-semibold text-black">{drawerMode === "create" ? "Neues Event" : "Event bearbeiten"}</div>
                <div className="mt-1 text-sm text-black/60">Name, Zeitraum und Ort sind für die operative Zuordnung relevant.</div>
              </div>
              <button className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold hover:bg-black/5" onClick={closeDrawer}>
                Schliessen
              </button>
            </div>

            <div className="p-5">
              <label className="block text-xs font-semibold text-black/60">Name</label>
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="z. B. Swissbau 2026"
                className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black/20"
              />

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-black/60">Start</label>
                  <input
                    type="date"
                    value={draft.startsAt}
                    onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-black/60">Ende</label>
                  <input
                    type="date"
                    value={draft.endsAt}
                    onChange={(e) => setDraft((d) => ({ ...d, endsAt: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black/20"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-semibold text-black/60">Ort (optional)</label>
                <input
                  value={draft.location}
                  onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                  placeholder="z. B. Basel"
                  className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black/20"
                />
              </div>

              {drawerMode === "edit" ? (
                <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                  <div className="text-xs font-semibold text-black/60">Status</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={classNames("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", statusChipClass(draft.status || "DRAFT"))}>
                      {statusLabel(draft.status || "DRAFT")}
                    </span>
                    <span className="text-xs text-black/50">Aktiv kann nur ein Event sein (Guardrail).</span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {draft.status !== "ACTIVE" && draft.status !== "ARCHIVED" && draft.id ? (
                      <button
                        className="rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-black/90"
                        onClick={() => void doActivate(draft.id!)}
                        disabled={saving}
                      >
                        Aktiv setzen
                      </button>
                    ) : null}

                    {draft.status !== "ARCHIVED" && draft.id ? (
                      <button
                        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-black/5"
                        onClick={() => void doArchive(draft.id!)}
                        disabled={saving}
                      >
                        Archivieren
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="mt-6 flex items-center justify-end gap-2">
                <button className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-black/5" onClick={closeDrawer} disabled={saving}>
                  Abbrechen
                </button>
                <button className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/90" onClick={() => void doSave()} disabled={saving}>
                  {saving ? "Speichern…" : "Speichern"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
