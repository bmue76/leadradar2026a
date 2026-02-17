"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type EventStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
type StatusFilter = "ALL" | EventStatus;

type SortKey = "startsAt" | "updatedAt" | "name";
type SortDir = "asc" | "desc";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type EventListItem = {
  id: string;
  name: string;
  status: EventStatus;
  startsAt?: string | null;
  endsAt?: string | null;
  location?: string | null;
  updatedAt: string;
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

type ConfirmKind = "activate" | "archive" | "delete";
type ConfirmState = { kind: ConfirmKind; id: string; name: string };

function classNames(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function makeEmptyDraft(): DraftEvent {
  return { name: "", startsAt: "", endsAt: "", location: "" };
}

function fmtDateDdMmYyyy(value?: string | null): string {
  if (!value) return "—";

  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function formatRange(startsAt?: string | null, endsAt?: string | null): string {
  if (startsAt && endsAt) return `${fmtDateDdMmYyyy(startsAt)} – ${fmtDateDdMmYyyy(endsAt)}`;
  if (startsAt) return `ab ${fmtDateDdMmYyyy(startsAt)}`;
  if (endsAt) return `bis ${fmtDateDdMmYyyy(endsAt)}`;
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
  if (s === "ACTIVE") return "border-emerald-200 bg-emerald-50 text-emerald-900";
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

export default function ScreenClient() {
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [q, setQ] = useState<string>("");

  const [sort, setSort] = useState<SortKey>("startsAt");
  const [dir, setDir] = useState<SortDir>("asc");

  const [items, setItems] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [draft, setDraft] = useState<DraftEvent>(makeEmptyDraft());
  const [saving, setSaving] = useState<boolean>(false);

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState<boolean>(false);

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
    return status !== "ALL" || !!q.trim() || sort !== "startsAt" || dir !== "asc";
  }, [status, q, sort, dir]);

  function pushNotice(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2500);
  }

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
    });
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    if (saving || confirmBusy) return;
    setDrawerOpen(false);
  }, [saving, confirmBusy]);

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
      setErr("Bitte einen Namen erfassen.");
      setTraceId(null);
      return;
    }

    setSaving(true);
    setErr(null);
    setTraceId(null);

    const payload = toPayload();

    if (drawerMode === "create") {
      const r = await fetchJson<{ item: EventListItem }>(`/api/admin/v1/events`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        setErr(r.error.message);
        setTraceId(r.traceId);
        setSaving(false);
        return;
      }

      setDrawerOpen(false);
      setSaving(false);
      pushNotice("Event erstellt.");
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
      setErr(r.error.message);
      setTraceId(r.traceId);
      setSaving(false);
      return;
    }

    setDrawerOpen(false);
    setSaving(false);
    pushNotice("Event gespeichert.");
    await reloadAll();
  }, [draft, drawerMode, reloadAll, toPayload]);

  const openConfirm = useCallback((kind: ConfirmKind, id: string, name: string) => {
    setConfirm({ kind, id, name });
  }, []);

  const closeConfirm = useCallback(() => {
    if (confirmBusy) return;
    setConfirm(null);
  }, [confirmBusy]);

  const runConfirm = useCallback(async () => {
    if (!confirm) return;

    setConfirmBusy(true);
    setErr(null);
    setTraceId(null);

    if (confirm.kind === "activate") {
      const r = await fetchJson<{ ok: true }>(`/api/admin/v1/events/${confirm.id}/activate`, { method: "POST" });
      if (!r.ok) {
        setErr(r.error.message);
        setTraceId(r.traceId);
        setConfirmBusy(false);
        return;
      }
      setConfirm(null);
      setConfirmBusy(false);
      pushNotice("Event aktiviert.");
      await reloadAll();
      return;
    }

    if (confirm.kind === "archive") {
      const r = await fetchJson<{ ok: true }>(`/api/admin/v1/events/${confirm.id}/archive`, { method: "POST" });
      if (!r.ok) {
        setErr(r.error.message);
        setTraceId(r.traceId);
        setConfirmBusy(false);
        return;
      }
      setConfirm(null);
      setConfirmBusy(false);
      pushNotice("Event archiviert.");
      await reloadAll();
      return;
    }

    const r = await fetchJson<{ ok: true }>(`/api/admin/v1/events/${confirm.id}`, { method: "DELETE" });
    if (!r.ok) {
      setErr(r.error.message);
      setTraceId(r.traceId);
      setConfirmBusy(false);
      return;
    }

    if (drawerOpen && draft.id === confirm.id) setDrawerOpen(false);

    setConfirm(null);
    setConfirmBusy(false);
    pushNotice("Event gelöscht.");
    await reloadAll();
  }, [confirm, draft.id, drawerOpen, reloadAll]); // <- confirmBusy entfernt

  const resetFilters = useCallback(() => {
    setStatus("ALL");
    setQ("");
    setSort("startsAt");
    setDir("asc");
  }, []);

  const confirmCopy = useMemo(() => {
    if (!confirm) return null;

    if (confirm.kind === "activate") {
      return {
        title: "Event aktivieren?",
        body: "Dieses Event wird aktiv gesetzt. Mehrere Events können aktiv sein.",
        confirmLabel: "Aktivieren",
        confirmClass: "bg-slate-900 text-white hover:bg-slate-800",
      };
    }

    if (confirm.kind === "archive") {
      return {
        title: "Event archivieren?",
        body: "Archivierte Events können in der App nicht mehr verwendet werden.",
        confirmLabel: "Archivieren",
        confirmClass: "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
      };
    }

    return {
      title: "Event löschen?",
      body:
        `„${confirm.name}“ wird gelöscht.\n\n` +
        "Nur möglich, wenn das Event nie genutzt wurde (keine Leads / keine referenzierenden Formulare / keine gebundenen Geräte).",
      confirmLabel: "Löschen",
      confirmClass: "bg-rose-600 text-white hover:bg-rose-700",
    };
  }, [confirm]);

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
                    disabled={loading}
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
                disabled={loading}
              >
                ↻
              </button>

              {hasActiveFilters ? (
                <button
                  className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  onClick={resetFilters}
                  disabled={loading}
                >
                  Reset
                </button>
              ) : null}

              <button
                className="h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
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
              className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300 md:w-[320px]"
            />

            <div className="flex items-center gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300"
              >
                <option value="startsAt">Sort: Startdatum</option>
                <option value="updatedAt">Sort: Updated</option>
                <option value="name">Sort: Name</option>
              </select>

              <select
                value={dir}
                onChange={(e) => setDir(e.target.value as SortDir)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300"
              >
                <option value="asc">↑ asc</option>
                <option value="desc">↓ desc</option>
              </select>
            </div>
          </div>

          {notice ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {notice}
            </div>
          ) : null}

          {err ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <div className="font-semibold">Fehler</div>
              <div className="mt-1">{err}</div>
              {traceId ? <div className="mt-2 text-xs text-rose-700/80">Trace: {traceId}</div> : null}
            </div>
          ) : null}
        </div>

        <div className="h-px w-full bg-slate-200" />

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
          ) : items.length === 0 ? (
            <div className="p-5">
              <div className="text-sm font-semibold text-slate-900">Keine Events</div>
              <div className="mt-1 text-sm text-slate-600">Lege dein erstes Event an.</div>
              <button
                className="mt-4 h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={openCreate}
              >
                Neues Event
              </button>
            </div>
          ) : (
            <div>
              {items.map((e) => {
                const canActivate = e.status === "DRAFT";
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
                      <span
                        className={classNames(
                          "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                          statusChipClass(e.status)
                        )}
                      >
                        {statusLabel(e.status)}
                      </span>
                    </div>

                    <div className="col-span-3 text-slate-700">{formatRange(e.startsAt ?? null, e.endsAt ?? null)}</div>
                    <div className="col-span-2 truncate text-slate-700">{e.location ?? "—"}</div>
                    <div className="col-span-1 text-right text-xs text-slate-500">{formatUpdated(e.updatedAt)}</div>

                    <div className="col-span-12 mt-2 hidden items-center gap-2 group-hover:flex">
                      {canActivate ? (
                        <button
                          className="h-9 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            openConfirm("activate", e.id, e.name);
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
                            openConfirm("archive", e.id, e.name);
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
                          onClick={(ev) => {
                            ev.stopPropagation();
                            openConfirm("delete", e.id, e.name);
                          }}
                          title="Löscht das Event (nur wenn nie genutzt)."
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

      {drawerOpen ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={closeDrawer} />
          <div className="absolute right-0 top-0 h-full w-full max-w-[520px] bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-5">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {drawerMode === "create" ? "Neues Event" : "Event bearbeiten"}
                </div>
                <div className="mt-1 text-sm text-slate-600">Name, Zeitraum und Ort sind für die operative Zuordnung relevant.</div>
              </div>
              <button
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
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
                className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300"
              />

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600">Start</label>
                  <input
                    type="date"
                    value={draft.startsAt}
                    onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))}
                    className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600">Ende</label>
                  <input
                    type="date"
                    value={draft.endsAt}
                    onChange={(e) => setDraft((d) => ({ ...d, endsAt: e.target.value }))}
                    className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-300"
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
                          className="h-9 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"
                          onClick={() => openConfirm("activate", draft.id!, draft.name)}
                          disabled={saving}
                        >
                          Aktiv setzen
                        </button>
                      ) : null}

                      {draft.status !== "ARCHIVED" && draft.id ? (
                        <button
                          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                          onClick={() => openConfirm("archive", draft.id!, draft.name)}
                          disabled={saving}
                        >
                          Archivieren
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {draft.id && draft.status !== "ACTIVE" ? (
                    <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-5">
                      <div className="text-xs font-semibold text-rose-800">Danger Zone</div>
                      <div className="mt-1 text-sm text-rose-800/90">
                        Löschen ist nur möglich, wenn das Event nie genutzt wurde (keine Leads / keine referenzierenden Formulare / keine gebundenen Geräte).
                      </div>
                      <button
                        className="mt-3 h-9 rounded-xl bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700"
                        onClick={() => openConfirm("delete", draft.id!, draft.name)}
                        disabled={saving}
                      >
                        Event löschen
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  onClick={closeDrawer}
                  disabled={saving}
                >
                  Abbrechen
                </button>
                <button
                  className="h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
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

      {confirm && confirmCopy ? (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/35" onClick={closeConfirm} />
          <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="p-5">
              <div className="text-base font-semibold text-slate-900">{confirmCopy.title}</div>
              <div className="mt-2 whitespace-pre-line text-sm text-slate-700">{confirmCopy.body}</div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                  onClick={closeConfirm}
                  disabled={confirmBusy}
                >
                  Abbrechen
                </button>
                <button
                  className={classNames("h-9 rounded-xl px-4 text-sm font-semibold disabled:opacity-50", confirmCopy.confirmClass)}
                  onClick={() => void runConfirm()}
                  disabled={confirmBusy}
                >
                  {confirmBusy ? "Bitte warten…" : confirmCopy.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
