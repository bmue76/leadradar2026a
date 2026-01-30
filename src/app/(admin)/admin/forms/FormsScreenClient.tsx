"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type FormStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
type AssignedFilter = "ALL" | "YES" | "NO";
type StatusFilter = "ALL" | FormStatus;
type SortKey = "updatedAt" | "name";
type SortDir = "asc" | "desc";

type FormListItem = {
  id: string;
  name: string;
  status: FormStatus;
  category?: string | null;
  updatedAt: string; // ISO
  assignedToActiveEvent: boolean;
  assignedEventId?: string | null;
};

type FormDetail = {
  id: string;
  name: string;
  description?: string | null;
  status: FormStatus;
  category?: string | null;
  updatedAt: string; // ISO
  assignedEventId?: string | null;
};

type ActiveEvent = { id: string; name: string } | null;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function readString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function readBoolean(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function toIso(d: unknown): string | null {
  if (typeof d === "string") return d;
  return null;
}

function fmtDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusLabel(s: FormStatus): string {
  if (s === "ACTIVE") return "Aktiv";
  if (s === "ARCHIVED") return "Archiviert";
  return "Entwurf";
}

function statusPillClass(s: FormStatus): string {
  if (s === "ACTIVE") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (s === "ARCHIVED") return "border-zinc-200 bg-zinc-50 text-zinc-700";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function normalizeListItems(json: unknown): FormListItem[] {
  // Accept several shapes (backward compatible):
  // - { ok:true, data:{ items: [...] } }
  // - { ok:true, data:{ forms: [...] } }
  if (!isRecord(json)) return [];
  const ok = readBoolean(json.ok);
  if (ok !== true) return [];

  const data = isRecord(json.data) ? (json.data as Record<string, unknown>) : null;
  if (!data) return [];

  const rawItems = Array.isArray(data.items) ? data.items : Array.isArray(data.forms) ? data.forms : [];
  const out: FormListItem[] = [];

  for (const row of rawItems) {
    if (!isRecord(row)) continue;

    const id = readString(row.id);
    const name = readString(row.name);
    const status = readString(row.status);
    const updatedAt = toIso(row.updatedAt);

    const assignedToActiveEvent = readBoolean(row.assignedToActiveEvent) ?? false;
    const assignedEventId = readString(row.assignedEventId);
    const category = readString(row.category);

    if (!id || !name || !status || !updatedAt) continue;
    if (!(status === "DRAFT" || status === "ACTIVE" || status === "ARCHIVED")) continue;

    out.push({
      id,
      name,
      status,
      updatedAt,
      category,
      assignedToActiveEvent,
      assignedEventId,
    });
  }

  return out;
}

function normalizeDetail(json: unknown): { item: FormDetail | null; error?: { message: string; code?: string; traceId?: string } } {
  if (!isRecord(json)) return { item: null, error: { message: "Ungültige Serverantwort." } };
  const ok = readBoolean(json.ok);
  const traceId = readString(json.traceId) ?? undefined;

  if (ok === true) {
    const data = isRecord(json.data) ? (json.data as Record<string, unknown>) : null;
    if (!data) return { item: null, error: { message: "Ungültige Serverantwort.", traceId } };

    const id = readString(data.id);
    const name = readString(data.name);
    const status = readString(data.status);
    const updatedAt = toIso(data.updatedAt);

    const description = readString(data.description);
    const category = readString(data.category);
    const assignedEventId = readString(data.assignedEventId);

    if (!id || !name || !status || !updatedAt) return { item: null, error: { message: "Ungültige Serverantwort.", traceId } };
    if (!(status === "DRAFT" || status === "ACTIVE" || status === "ARCHIVED")) return { item: null, error: { message: "Ungültige Serverantwort.", traceId } };

    return {
      item: { id, name, status, updatedAt, description, category, assignedEventId },
    };
  }

  const err = isRecord(json.error) ? (json.error as Record<string, unknown>) : null;
  const message = (err && readString(err.message)) || "Konnte nicht laden.";
  const code = (err && readString(err.code)) || undefined;

  return { item: null, error: { message, code, traceId } };
}

function normalizeActiveEvent(json: unknown): ActiveEvent {
  // expected: { ok:true, data:{ item: { id, name, ... } | null } }
  if (!isRecord(json)) return null;
  const ok = readBoolean(json.ok);
  if (ok !== true) return null;

  const data = isRecord(json.data) ? (json.data as Record<string, unknown>) : null;
  if (!data) return null;

  const item = isRecord(data.item) ? (data.item as Record<string, unknown>) : null;
  if (!item) return null;

  const id = readString(item.id);
  const name = readString(item.name);
  if (!id || !name) return null;
  return { id, name };
}

function buildQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const vv = (v ?? "").trim();
    if (vv) sp.set(k, vv);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function IconDots(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M6 12a1.6 1.6 0 1 0 0 .01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 12a1.6 1.6 0 1 0 0 .01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 12a1.6 1.6 0 1 0 0 .01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Drawer({
  open,
  onClose,
  activeEvent,
  selectedId,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  activeEvent: ActiveEvent;
  selectedId: string | null;
  onChanged: (opts: { refreshList?: boolean; openId?: string | null }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState<FormDetail | null>(null);
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadDetail = useCallback(async () => {
    if (!selectedId) {
      setItem(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setFlash(null);

    try {
      const res = await fetch(`/api/admin/v1/forms/${encodeURIComponent(selectedId)}`, { cache: "no-store" });
      const json: unknown = await res.json();

      const normalized = normalizeDetail(json);
      if (!mountedRef.current) return;

      if (normalized.error) {
        setItem(null);
        setError(normalized.error);
        setLoading(false);
        return;
      }

      setItem(normalized.item);
      setError(null);
      setLoading(false);
    } catch {
      if (!mountedRef.current) return;
      setItem(null);
      setError({ message: "Konnte nicht laden. Bitte erneut versuchen." });
      setLoading(false);
    }
  }, [selectedId]);

  // ESLint rule: no setState trigger directly inside effect → defer
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      void loadDetail();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, loadDetail]);

  const setStatus = useCallback(
    async (next: FormStatus) => {
      if (!selectedId) return;

      setSaving(true);
      setFlash(null);

      try {
        // MVP-Guardrail: Archiviert => assignment entfernen (explizit)
        const body: Record<string, unknown> = { status: next };
        if (next === "ARCHIVED") body.setAssignedToActiveEvent = false;

        const res = await fetch(`/api/admin/v1/forms/${encodeURIComponent(selectedId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });

        const json: unknown = await res.json();
        const norm = normalizeDetail(json);

        if (!mountedRef.current) return;

        if (norm.error) {
          setFlash(norm.error.message);
          setSaving(false);
          return;
        }

        setItem(norm.item);
        setSaving(false);
        setFlash("Gespeichert.");
        onChanged({ refreshList: true });
      } catch {
        if (!mountedRef.current) return;
        setSaving(false);
        setFlash("Speichern fehlgeschlagen.");
      }
    },
    [selectedId, onChanged]
  );

  const setAssignedToActive = useCallback(
    async (next: boolean) => {
      if (!selectedId) return;

      setSaving(true);
      setFlash(null);

      try {
        const res = await fetch(`/api/admin/v1/forms/${encodeURIComponent(selectedId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ setAssignedToActiveEvent: next }),
        });

        const json: unknown = await res.json();
        const norm = normalizeDetail(json);

        if (!mountedRef.current) return;

        if (norm.error) {
          setFlash(norm.error.message);
          setSaving(false);
          return;
        }

        setItem(norm.item);
        setSaving(false);
        setFlash(next ? "Dem aktiven Event zugewiesen." : "Zuweisung entfernt.");
        onChanged({ refreshList: true });
      } catch {
        if (!mountedRef.current) return;
        setSaving(false);
        setFlash("Speichern fehlgeschlagen.");
      }
    },
    [selectedId, onChanged]
  );

  const duplicate = useCallback(async () => {
    if (!selectedId) return;

    setSaving(true);
    setFlash(null);

    try {
      const res = await fetch(`/api/admin/v1/forms/${encodeURIComponent(selectedId)}/duplicate`, { method: "POST" });
      const json: unknown = await res.json();

      if (!isRecord(json) || readBoolean(json.ok) !== true || !isRecord(json.data)) {
        setSaving(false);
        setFlash("Duplizieren fehlgeschlagen.");
        return;
      }

      const newId = readString((json.data as Record<string, unknown>).id);
      setSaving(false);
      setFlash("Kopie erstellt.");
      onChanged({ refreshList: true, openId: newId ?? null });
    } catch {
      setSaving(false);
      setFlash("Duplizieren fehlgeschlagen.");
    }
  }, [selectedId, onChanged]);

  const archive = useCallback(async () => {
    await setStatus("ARCHIVED");
  }, [setStatus]);

  const canToggleAssigned = useMemo(() => {
    if (!item) return false;
    if (item.status === "ARCHIVED") return false;
    if (!activeEvent) return false;
    return true;
  }, [item, activeEvent]);

  const assignedNow = useMemo(() => {
    if (!item) return false;
    if (!activeEvent) return false;
    return (item.assignedEventId ?? null) === activeEvent.id;
  }, [item, activeEvent]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        className="absolute inset-0 bg-black/20"
        aria-label="Schliessen"
        onClick={onClose}
      />

      <aside
        className="absolute right-0 top-0 h-full w-full max-w-[520px] border-l border-slate-200 bg-white"
        role="dialog"
        aria-modal="true"
        aria-label="Formular Details"
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">Formular</div>
            <div className="text-xs text-slate-500">Details &amp; Aktionen</div>
          </div>

          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            onClick={onClose}
          >
            Schliessen
          </button>
        </div>

        <div className="h-[calc(100%-3.5rem)] overflow-auto p-4">
          {!selectedId ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Keine Auswahl</div>
              <div className="mt-1 text-sm text-slate-600">Wähle links ein Formular aus.</div>
            </div>
          ) : loading ? (
            <div className="space-y-3">
              <div className="h-6 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
              <div className="h-10 w-full animate-pulse rounded bg-slate-100" />
              <div className="h-10 w-full animate-pulse rounded bg-slate-100" />
              <div className="h-24 w-full animate-pulse rounded bg-slate-100" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Konnte nicht laden</div>
              <div className="mt-1 text-sm text-slate-600">{error.message}</div>
              {(error.code || error.traceId) ? (
                <div className="mt-2 text-xs text-slate-500">
                  {error.code ? `Code: ${error.code}` : null}
                  {error.code && error.traceId ? " • " : null}
                  {error.traceId ? `Trace: ${error.traceId}` : null}
                </div>
              ) : null}
              <div className="mt-3">
                <button
                  type="button"
                  className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  onClick={() => void loadDetail()}
                >
                  Erneut versuchen
                </button>
              </div>
            </div>
          ) : !item ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Nicht gefunden</div>
              <div className="mt-1 text-sm text-slate-600">Dieses Formular existiert nicht (mehr).</div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="text-xl font-semibold tracking-tight text-slate-900">{item.name}</div>
                <div className="mt-1 text-sm text-slate-600">Aktualisiert: {fmtDateTime(item.updatedAt)}</div>
                {item.category ? <div className="mt-1 text-xs text-slate-500">Kategorie: {item.category}</div> : null}
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-900">Status</div>
                <div className="mt-2">
                  <select
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    value={item.status}
                    onChange={(e) => void setStatus(e.target.value as FormStatus)}
                    disabled={saving}
                  >
                    <option value="DRAFT">Entwurf</option>
                    <option value="ACTIVE">Aktiv</option>
                    <option value="ARCHIVED">Archiviert</option>
                  </select>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Nur <span className="font-semibold">Aktiv</span> + zugewiesen = in der App sichtbar.
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-900">Verfügbarkeit</div>
                <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">
                      Im aktiven Event verfügbar{activeEvent ? ` (${activeEvent.name})` : ""}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Mobile zeigt nur <span className="font-semibold">ACTIVE</span> Formulare, die dem aktiven Event zugewiesen sind.
                    </div>
                    {!activeEvent ? (
                      <div className="mt-2 text-xs text-rose-600">
                        Kein aktives Event. Bitte zuerst ein Event aktivieren.
                      </div>
                    ) : null}
                    {item.status === "ARCHIVED" ? (
                      <div className="mt-2 text-xs text-zinc-600">
                        Archivierte Formulare können nicht dem aktiven Event zugewiesen sein.
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className={`relative inline-flex h-7 w-12 items-center rounded-full border transition-colors ${
                      assignedNow ? "border-emerald-200 bg-emerald-100" : "border-slate-200 bg-slate-100"
                    } ${!canToggleAssigned || saving ? "opacity-50 pointer-events-none" : ""}`}
                    aria-pressed={assignedNow ? "true" : "false"}
                    onClick={() => void setAssignedToActive(!assignedNow)}
                  >
                    <span
                      className={`inline-block size-5 translate-x-1 rounded-full bg-white shadow-sm transition-transform ${
                        assignedNow ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900">Aktionen</div>

                <div className="grid grid-cols-1 gap-2">
                  <Link
                    href={`/admin/forms/${encodeURIComponent(item.id)}/builder`}
                    className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Im Builder öffnen
                  </Link>

                  <Link
                    href={`/admin/forms/${encodeURIComponent(item.id)}/builder?view=preview`}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  >
                    Vorschau
                  </Link>

                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                    onClick={() => void duplicate()}
                    disabled={saving}
                  >
                    Duplizieren
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100"
                    onClick={() => void archive()}
                    disabled={saving}
                  >
                    Archivieren
                  </button>
                </div>

                {flash ? <div className="text-xs text-slate-600">{flash}</div> : null}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export function FormsScreenClient() {
  const [q, setQ] = useState("");
  const [status, setStatusFilter] = useState<StatusFilter>("ALL");
  const [assigned, setAssigned] = useState<AssignedFilter>("ALL");
  const [sort, setSort] = useState<SortKey>("updatedAt");
  const [dir, setDir] = useState<SortDir>("desc");

  const [activeEvent, setActiveEvent] = useState<ActiveEvent>(null);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FormListItem[]>([]);
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const lastLoadRef = useRef<number>(0);

  const loadActiveEvent = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/v1/events/active", { cache: "no-store" });
      const json: unknown = await res.json();
      setActiveEvent(normalizeActiveEvent(json));
    } catch {
      setActiveEvent(null);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);

    const reqId = Date.now();
    lastLoadRef.current = reqId;

    try {
      const query = buildQuery({
        q: q.trim() ? q.trim() : undefined,
        status: status === "ALL" ? "ALL" : status,
        assigned,
        sort,
        dir,
      });

      const res = await fetch(`/api/admin/v1/forms${query}`, { cache: "no-store" });
      const json: unknown = await res.json();

      if (lastLoadRef.current !== reqId) return;

      const parsed = normalizeListItems(json);

      if (parsed.length === 0) {
        if (isRecord(json) && readBoolean(json.ok) === false) {
          const traceId = readString(json.traceId) ?? undefined;
          const err = isRecord(json.error) ? (json.error as Record<string, unknown>) : null;
          const message = (err && readString(err.message)) || "Liste konnte nicht geladen werden.";
          const code = (err && readString(err.code)) || undefined;

          setItems([]);
          setError({ message, code, traceId });
          setLoading(false);
          return;
        }
      }

      setItems(parsed);
      setError(null);
      setLoading(false);
    } catch {
      if (lastLoadRef.current !== reqId) return;
      setItems([]);
      setError({ message: "Liste konnte nicht geladen werden. Bitte erneut versuchen." });
      setLoading(false);
    }
  }, [q, status, assigned, sort, dir]);

  // ESLint rule: no setState trigger directly inside effect → defer
  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadActiveEvent();
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadActiveEvent]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadList();
    }, 0);
    return () => window.clearTimeout(t);
  }, [loadList]);

  const countLabel = useMemo(() => {
    if (loading) return "…";
    const n = items.length;
    if (n === 1) return "1 Formular";
    return `${n} Formulare`;
  }, [loading, items.length]);

  const onRowClick = useCallback((id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
  }, []);

  const refresh = useCallback(() => {
    void loadActiveEvent();
    void loadList();
  }, [loadActiveEvent, loadList]);

  const resetFilters = useCallback(() => {
    setQ("");
    setStatusFilter("ALL");
    setAssigned("ALL");
    setSort("updatedAt");
    setDir("desc");
  }, []);

  const activeEventName = activeEvent?.name ?? "";

  return (
    <div className="lr-page">
      {/* Toolbar */}
      <div className="lr-toolbar">
        <div className="lr-toolbarLeft">
          <input
            className="lr-input w-[240px]"
            placeholder="Suchen…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select className="lr-select" value={status} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
            <option value="ALL">Status: Alle</option>
            <option value="DRAFT">Status: Entwurf</option>
            <option value="ACTIVE">Status: Aktiv</option>
            <option value="ARCHIVED">Status: Archiviert</option>
          </select>

          <select className="lr-select" value={assigned} onChange={(e) => setAssigned(e.target.value as AssignedFilter)}>
            <option value="ALL">Im aktiven Event: Alle</option>
            <option value="YES">Im aktiven Event: Ja</option>
            <option value="NO">Im aktiven Event: Nein</option>
          </select>

          <select className="lr-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="updatedAt">Sortierung: Aktualisiert</option>
            <option value="name">Sortierung: Name</option>
          </select>

          <select className="lr-select" value={dir} onChange={(e) => setDir(e.target.value as SortDir)}>
            <option value="desc">Absteigend</option>
            <option value="asc">Aufsteigend</option>
          </select>

          <span className="lr-count">{countLabel}</span>
        </div>

        <div className="lr-toolbarRight">
          <button type="button" className="lr-btnSecondary" onClick={resetFilters}>
            Reset
          </button>
          <button type="button" className="lr-btnSecondary" onClick={refresh}>
            Refresh
          </button>

          <Link className="lr-btn" href="/admin/templates">
            Neues Formular
          </Link>
        </div>
      </div>

      <div className="lr-divider" />

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="text-left text-xs font-semibold text-slate-600">
                <th className="border-b border-slate-200 px-4 py-3">Name</th>
                <th className="border-b border-slate-200 px-4 py-3">Status</th>
                <th className="border-b border-slate-200 px-4 py-3">Kategorie</th>
                <th className="border-b border-slate-200 px-4 py-3">Zuweisung</th>
                <th className="border-b border-slate-200 px-4 py-3">Aktualisiert</th>
                <th className="border-b border-slate-200 px-4 py-3 text-right">
                  <span className="sr-only">Aktionen</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`s_${i}`} className="animate-pulse">
                      <td className="border-b border-slate-100 px-4 py-3">
                        <div className="h-4 w-56 rounded bg-slate-100" />
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <div className="h-6 w-20 rounded-full bg-slate-100" />
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <div className="h-4 w-28 rounded bg-slate-100" />
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <div className="h-4 w-40 rounded bg-slate-100" />
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <div className="h-4 w-36 rounded bg-slate-100" />
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3" />
                    </tr>
                  ))}
                </>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-semibold text-slate-900">Konnte nicht laden</div>
                      <div className="mt-1 text-sm text-slate-600">{error.message}</div>
                      {(error.code || error.traceId) ? (
                        <div className="mt-2 text-xs text-slate-500">
                          {error.code ? `Code: ${error.code}` : null}
                          {error.code && error.traceId ? " • " : null}
                          {error.traceId ? `Trace: ${error.traceId}` : null}
                        </div>
                      ) : null}
                      <div className="mt-3">
                        <button
                          type="button"
                          className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                          onClick={refresh}
                        >
                          Erneut versuchen
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10">
                    <div className="mx-auto max-w-xl text-center">
                      <div className="text-sm font-semibold text-slate-900">Keine Formulare</div>
                      <div className="mt-1 text-sm text-slate-600">
                        Erstelle ein Formular oder passe die Filter an.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((it) => {
                  const assignedLabel =
                    it.assignedToActiveEvent && activeEventName
                      ? activeEventName
                      : it.assignedToActiveEvent
                      ? "Zugewiesen"
                      : "—";

                  return (
                    <tr
                      key={it.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => onRowClick(it.id)}
                      aria-label={`Formular ${it.name} öffnen`}
                    >
                      <td className="border-b border-slate-100 px-4 py-3">
                        <div className="text-sm font-semibold text-slate-900">{it.name}</div>
                      </td>

                      <td className="border-b border-slate-100 px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${statusPillClass(
                            it.status
                          )}`}
                        >
                          {statusLabel(it.status)}
                        </span>
                      </td>

                      <td className="border-b border-slate-100 px-4 py-3">
                        <div className="text-sm text-slate-700">{it.category ?? "—"}</div>
                      </td>

                      <td className="border-b border-slate-100 px-4 py-3">
                        <div className="text-sm text-slate-700">{assignedLabel}</div>
                      </td>

                      <td className="border-b border-slate-100 px-4 py-3">
                        <div className="text-sm text-slate-700">{fmtDateTime(it.updatedAt)}</div>
                      </td>

                      <td className="border-b border-slate-100 px-4 py-3 text-right">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-xl border border-transparent bg-white p-2 text-slate-600 hover:border-slate-200 hover:bg-slate-50"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRowClick(it.id);
                          }}
                          aria-label="Aktionen"
                          title="Details"
                        >
                          <IconDots className="size-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
          Mobile zeigt nur <span className="font-semibold">ACTIVE</span> Formulare, die dem aktiven Event zugewiesen sind (Option 2).
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeEvent={activeEvent}
        selectedId={selectedId}
        onChanged={({ refreshList, openId }) => {
          if (refreshList) refresh();
          if (openId) {
            setSelectedId(openId);
            setDrawerOpen(true);
          }
        }}
      />
    </div>
  );
}
