"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type ExportStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";
type ExportScope = "ACTIVE_EVENT" | "ALL";
type LeadStatusFilter = "ALL" | "NEW" | "REVIEWED";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type ExportListItem = {
  id: string;
  status: ExportStatus;
  createdAt: string;
  updatedAt: string;
  title: string;
  rowCount?: number;
  fileName?: string;
  fileUrl?: string;
  errorMessage?: string;
  errorTraceId?: string;
  filters: { scope: ExportScope; leadStatus: LeadStatusFilter; q?: string };
};

type ListResp = {
  items: ExportListItem[];
  nextCursor?: string;
};

type CreateResp = { job: { id: string; status: ExportStatus } };

type Props = {
  initialDefaults: { scope: ExportScope; leadStatus: LeadStatusFilter; q: string };
  eventsLinkHref: string;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<ApiResp<T>> {
  const res = await fetch(url, init);
  const text = await res.text();
  try {
    return JSON.parse(text) as ApiResp<T>;
  } catch {
    return {
      ok: false,
      error: { code: "BAD_JSON", message: "Invalid JSON response." },
      traceId: res.headers.get("x-trace-id") || "",
    };
  }
}

function fmtDt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("de-CH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusPill(status: ExportStatus) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
  switch (status) {
    case "DONE":
      return `${base} bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200`;
    case "FAILED":
      return `${base} bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200`;
    case "RUNNING":
      return `${base} bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200`;
    case "QUEUED":
    default:
      return `${base} bg-neutral-50 text-neutral-700 ring-1 ring-inset ring-neutral-200`;
  }
}

function buttonClass(kind: "primary" | "secondary" | "ghost", disabled?: boolean) {
  const base =
    "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-neutral-300";
  const dis = disabled ? "opacity-50 pointer-events-none" : "";
  if (kind === "primary") return `${base} ${dis} bg-neutral-900 text-white hover:bg-neutral-800`;
  if (kind === "secondary") return `${base} ${dis} bg-white text-neutral-900 ring-1 ring-inset ring-neutral-300 hover:bg-neutral-50`;
  return `${base} ${dis} bg-transparent text-neutral-800 hover:bg-neutral-100`;
}

export default function ExportsScreenClient({ initialDefaults, eventsLinkHref }: Props) {
  const [scope, setScope] = useState<ExportScope>(initialDefaults.scope);
  const [leadStatus, setLeadStatus] = useState<LeadStatusFilter>(initialDefaults.leadStatus);
  const [q, setQ] = useState<string>(initialDefaults.q);

  const [items, setItems] = useState<ExportListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [creating, setCreating] = useState<boolean>(false);

  const [error, setError] = useState<{ message: string; traceId?: string } | null>(null);
  const [createError, setCreateError] = useState<{ message: string; traceId?: string; code?: string } | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);

  const hasRunning = useMemo(() => items.some((i) => i.status === "RUNNING" || i.status === "QUEUED"), [items]);

  const load = useCallback(async () => {
    setError(null);
    const data = await fetchJson<ListResp>("/api/admin/v1/exports?take=20");
    if (!data.ok) {
      setError({ message: data.error.message, traceId: data.traceId });
      return;
    }
    setItems(data.data.items);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await load();
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [load]);

  useEffect(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!hasRunning) return;

    pollRef.current = window.setInterval(() => {
      load().catch(() => {});
    }, 2500);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [hasRunning, load]);

  const onCreate = useCallback(async () => {
    setCreateError(null);
    setCreating(true);
    try {
      const payload: { scope: ExportScope; leadStatus: LeadStatusFilter; format: "CSV"; q?: string } = {
        scope,
        leadStatus,
        format: "CSV",
      };
      const qq = q.trim();
      if (qq) payload.q = qq;

      const resp = await fetchJson<CreateResp>("/api/admin/v1/exports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        setCreateError({ message: resp.error.message, traceId: resp.traceId, code: resp.error.code });
        return;
      }

      await load();
    } finally {
      setCreating(false);
    }
  }, [scope, leadStatus, q, load]);

  const onRetry = useCallback(async () => {
    await onCreate();
  }, [onCreate]);

  const copyToClipboard = useCallback(async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-neutral-900">Export erstellen</div>
            <div className="mt-1 text-sm text-neutral-600">
              Standard: <span className="font-medium">Aktives Event</span>. Optional: Nur neue / Nur bearbeitet / Suche.
            </div>
          </div>
          <button className={buttonClass("secondary", loading)} onClick={() => load()} type="button">
            Refresh
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block">
            <div className="text-xs font-medium text-neutral-600">Scope</div>
            <select
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
              value={scope}
              onChange={(e) => setScope(e.target.value as ExportScope)}
            >
              <option value="ACTIVE_EVENT">Aktives Event</option>
              <option value="ALL">Alle (tenant)</option>
            </select>
          </label>

          <label className="block">
            <div className="text-xs font-medium text-neutral-600">Leads</div>
            <select
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
              value={leadStatus}
              onChange={(e) => setLeadStatus(e.target.value as LeadStatusFilter)}
            >
              <option value="ALL">Alle</option>
              <option value="NEW">Nur neue</option>
              <option value="REVIEWED">Nur bearbeitet</option>
            </select>
          </label>

          <label className="block">
            <div className="text-xs font-medium text-neutral-600">Suche (optional)</div>
            <input
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder='z. B. "Müller" oder "Zürich"'
            />
          </label>
        </div>

        {createError ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <div className="font-medium">Export fehlgeschlagen</div>
            <div className="mt-1">{createError.message}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-rose-700">
              {createError.code ? <span className="rounded bg-white/60 px-2 py-0.5">Code: {createError.code}</span> : null}
              {createError.traceId ? (
                <>
                  <span className="rounded bg-white/60 px-2 py-0.5">TraceId: {createError.traceId}</span>
                  <button className="underline" type="button" onClick={() => copyToClipboard(createError.traceId!)}>
                    TraceId kopieren
                  </button>
                </>
              ) : null}
              {createError.code === "NO_ACTIVE_EVENT" ? (
                <Link className="underline" href={eventsLinkHref}>
                  Zu Events
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs text-neutral-500">
            CSV ist Excel-kompatibel (UTF-8). Dynamische Felder werden als <span className="font-mono">field_*</span> exportiert.
          </div>
          <button className={buttonClass("primary", creating)} onClick={onCreate} type="button">
            {creating ? "Exportiere…" : "CSV exportieren"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-neutral-900">Letzte Exporte</div>
            <div className="mt-1 text-xs text-neutral-600">Jobs werden bei RUNNING/QUEUED automatisch aktualisiert.</div>
          </div>
          {hasRunning ? <span className="text-xs text-neutral-600">Polling aktiv…</span> : <span className="text-xs text-neutral-500">—</span>}
        </div>

        {loading ? (
          <div className="p-4 text-sm text-neutral-600">Lade Exporte…</div>
        ) : error ? (
          <div className="p-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <div className="font-medium">Fehler</div>
              <div className="mt-1">{error.message}</div>
              {error.traceId ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-rose-700">
                  <span className="rounded bg-white/60 px-2 py-0.5">TraceId: {error.traceId}</span>
                  <button className="underline" type="button" onClick={() => copyToClipboard(error.traceId!)}>
                    TraceId kopieren
                  </button>
                  <button className="underline" type="button" onClick={() => load()}>
                    Retry
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="p-4 text-sm text-neutral-600">Noch keine Exporte. Erstelle oben deinen ersten CSV-Export.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-xs text-neutral-600">
                  <th className="border-b border-neutral-200 px-4 py-2 font-medium">Zeitpunkt</th>
                  <th className="border-b border-neutral-200 px-4 py-2 font-medium">Titel</th>
                  <th className="border-b border-neutral-200 px-4 py-2 font-medium">Status</th>
                  <th className="border-b border-neutral-200 px-4 py-2 font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const expanded = expandedId === it.id;
                  return (
                    <React.Fragment key={it.id}>
                      <tr className="hover:bg-neutral-50">
                        <td className="border-b border-neutral-100 px-4 py-3 text-sm text-neutral-700">
                          <div>{fmtDt(it.createdAt)}</div>
                          <div className="mt-0.5 text-xs text-neutral-500">Update: {fmtDt(it.updatedAt)}</div>
                        </td>
                        <td className="border-b border-neutral-100 px-4 py-3 text-sm text-neutral-900">
                          <div className="font-medium">{it.title}</div>
                          <div className="mt-0.5 text-xs text-neutral-600">
                            {typeof it.rowCount === "number" ? `${it.rowCount} Zeilen` : "—"}
                            {it.fileName ? <span className="ml-2 font-mono text-[11px] text-neutral-500">{it.fileName}</span> : null}
                          </div>
                        </td>
                        <td className="border-b border-neutral-100 px-4 py-3 text-sm text-neutral-700">
                          <span className={statusPill(it.status)}>{it.status}</span>
                        </td>
                        <td className="border-b border-neutral-100 px-4 py-3 text-sm text-neutral-700">
                          <div className="flex flex-wrap items-center gap-2">
                            {it.status === "DONE" && it.fileUrl ? (
                              <a className={buttonClass("secondary")} href={it.fileUrl}>
                                Download
                              </a>
                            ) : null}

                            {it.status === "FAILED" ? (
                              <button className={buttonClass("secondary")} type="button" onClick={onRetry}>
                                Retry
                              </button>
                            ) : null}

                            <button className={buttonClass("ghost")} type="button" onClick={() => setExpandedId(expanded ? null : it.id)}>
                              Details
                            </button>
                          </div>
                        </td>
                      </tr>

                      {expanded ? (
                        <tr>
                          <td colSpan={4} className="border-b border-neutral-100 bg-neutral-50 px-4 py-3">
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                              <div className="text-xs text-neutral-600">
                                <div className="font-medium text-neutral-800">Filter</div>
                                <div className="mt-1">
                                  Scope: <span className="font-mono">{it.filters.scope}</span>
                                </div>
                                <div>
                                  Leads: <span className="font-mono">{it.filters.leadStatus}</span>
                                </div>
                                <div>
                                  Suche: <span className="font-mono">{it.filters.q ? `"${it.filters.q}"` : "—"}</span>
                                </div>
                              </div>

                              <div className="text-xs text-neutral-600">
                                <div className="font-medium text-neutral-800">Job</div>
                                <div className="mt-1">
                                  ID: <span className="font-mono">{it.id}</span>
                                </div>
                                <div>
                                  Status: <span className="font-mono">{it.status}</span>
                                </div>
                              </div>

                              <div className="text-xs text-neutral-600">
                                <div className="font-medium text-neutral-800">Fehler</div>
                                <div className="mt-1">{it.errorMessage ?? "—"}</div>
                                {it.errorTraceId ? (
                                  <div className="mt-1 flex items-center gap-2">
                                    <span className="rounded bg-white px-2 py-0.5 font-mono text-[11px]">{it.errorTraceId}</span>
                                    <button className="underline" type="button" onClick={() => copyToClipboard(it.errorTraceId!)}>
                                      TraceId kopieren
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
