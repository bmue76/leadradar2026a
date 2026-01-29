"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };

type ExportItem = {
  id: string;
  type: "CSV";
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

type ExportsResponse = {
  items: Array<{
    id: string;
    type: "CSV";
    status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
    queuedAt: string | Date;
    startedAt: string | Date | null;
    finishedAt: string | Date | null;
    updatedAt: string | Date;
  }>;
  meta?: { leadsTotal?: number };
};

type State =
  | { phase: "loading" }
  | { phase: "error"; title: string; message: string; code: string; traceId: string }
  | { phase: "ready"; items: ExportItem[]; leadsTotal: number };

function toIso(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  return v.toISOString();
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("de-CH", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusText(s: ExportItem["status"]): string {
  if (s === "DONE") return "Abgeschlossen";
  if (s === "FAILED") return "Fehlgeschlagen";
  if (s === "RUNNING") return "Läuft";
  return "Erstellt";
}

function pillLabel(s: ExportItem["status"]): "OK" | "WARN" | "BLOCK" {
  if (s === "DONE") return "OK";
  if (s === "FAILED") return "BLOCK";
  return "WARN";
}

function pillClass(s: ExportItem["status"]): string {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide";
  if (s === "DONE") return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
  if (s === "FAILED") return `${base} border-rose-200 bg-rose-50 text-rose-700`;
  return `${base} border-amber-200 bg-amber-50 text-amber-700`;
}

function Skeleton() {
  return (
    <div className="lr-page">
      <header className="lr-pageHeader">
        <h1 className="lr-h1">Exports</h1>
        <p className="lr-muted">CSV erstellen und herunterladen.</p>
      </header>

      <section className="lr-panel">
        <div className="lr-panelHeader">
          <h2 className="lr-h2">Übersicht</h2>
          <p className="lr-muted">Lade…</p>
        </div>

        <div className="lr-list">
          <div className="lr-listItem">
            <div className="lr-listTitle">—</div>
            <div className="lr-muted">—</div>
          </div>
          <div className="lr-listItem">
            <div className="lr-listTitle">—</div>
            <div className="lr-muted">—</div>
          </div>
          <div className="lr-listItem">
            <div className="lr-listTitle">—</div>
            <div className="lr-muted">—</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function EmptyStateNoLeads() {
  return (
    <section className="lr-panel">
      <div className="lr-panelHeader">
        <h2 className="lr-h2">Noch keine Exporte</h2>
        <p className="lr-muted">Erst Leads erfassen, dann CSV exportieren.</p>
      </div>

      <div className="lr-actions">
        <Link className="lr-btn" href="/admin/leads">
          Zu den Leads
        </Link>
        <Link className="lr-btnSecondary" href="/admin">
          Übersicht
        </Link>
      </div>
    </section>
  );
}

function EmptyStateNoExportsYet() {
  return (
    <section className="lr-panel">
      <div className="lr-panelHeader">
        <h2 className="lr-h2">Noch kein Export</h2>
        <p className="lr-muted">Hier erscheinen eure CSV-Exports.</p>
      </div>

      <div className="lr-actions">
        <Link className="lr-btn" href="/admin/leads">
          Leads ansehen
        </Link>
        <Link className="lr-btnSecondary" href="/admin">
          Übersicht
        </Link>
      </div>
    </section>
  );
}

export default function ExportsClient() {
  const [state, setState] = useState<State>({ phase: "loading" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/v1/exports?limit=50", { cache: "no-store" });
      const json = (await res.json()) as ApiOk<ExportsResponse> | ApiErr;

      if (!json.ok) {
        setState({
          phase: "error",
          title: "Konnte nicht laden",
          message: json.error?.message || "Unexpected error.",
          code: json.error?.code || "INTERNAL_ERROR",
          traceId: json.traceId || "—",
        });
        return;
      }

      const itemsRaw = json.data.items ?? [];
      const items: ExportItem[] = itemsRaw.map((x) => ({
        id: x.id,
        type: x.type,
        status: x.status,
        queuedAt: toIso(x.queuedAt) ?? new Date().toISOString(),
        startedAt: toIso(x.startedAt),
        finishedAt: toIso(x.finishedAt),
        updatedAt: toIso(x.updatedAt) ?? new Date().toISOString(),
      }));

      const leadsTotal = Number(json.data.meta?.leadsTotal ?? 0);

      setState({ phase: "ready", items, leadsTotal });
    } catch {
      setState({
        phase: "error",
        title: "Konnte nicht laden",
        message: "Unexpected error.",
        code: "INTERNAL_ERROR",
        traceId: "—",
      });
    }
  }, []);

  // ESLint rule react-hooks/set-state-in-effect:
  // -> call load in a callback (async tick), not synchronously in effect body.
  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const onRetry = useCallback(() => {
    setState({ phase: "loading" });
    void load();
  }, [load]);

  const content = useMemo(() => {
    if (state.phase === "loading") return <Skeleton />;

    if (state.phase === "error") {
      return (
        <div className="lr-page">
          <header className="lr-pageHeader">
            <h1 className="lr-h1">Exports</h1>
            <p className="lr-muted">CSV erstellen und herunterladen.</p>
          </header>

          <section className="lr-panel">
            <div className="lr-panelHeader">
              <h2 className="lr-h2">Ein ruhiger Fehlerzustand</h2>
              <p className="lr-muted">Nichts ist kaputt — wir versuchen es nochmals.</p>
            </div>

            <div className="lr-list">
              <div className="lr-listItem">
                <div className="lr-listTitle">{state.title}</div>
                <div className="lr-muted">{state.message}</div>
                <div className="lr-muted" style={{ marginTop: 8 }}>
                  Code: {state.code} • Trace: {state.traceId}
                </div>
                <div className="lr-actions" style={{ marginTop: 12 }}>
                  <button className="lr-btn" onClick={onRetry} type="button">
                    Erneut versuchen
                  </button>
                  <Link className="lr-btnSecondary" href="/admin">
                    Übersicht
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      );
    }

    const { items, leadsTotal } = state;

    return (
      <div className="lr-page">
        <header className="lr-pageHeader">
          <h1 className="lr-h1">Exports</h1>
          <p className="lr-muted">CSV erstellen und herunterladen.</p>
        </header>

        {items.length <= 0 ? (
          leadsTotal <= 0 ? (
            <EmptyStateNoLeads />
          ) : (
            <EmptyStateNoExportsYet />
          )
        ) : (
          <section className="lr-panel">
            <div className="lr-panelHeader">
              <h2 className="lr-h2">Letzte Exporte</h2>
              <p className="lr-muted">Übersicht über eure CSV-Jobs.</p>
            </div>

            <div className="lr-list">
              {items.map((it) => (
                <div key={it.id} className="lr-listItem">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div className="lr-listTitle">CSV Export</div>
                    <span className={pillClass(it.status)}>{pillLabel(it.status)}</span>
                  </div>

                  <div className="lr-muted">
                    {statusText(it.status)} • {formatWhen(it.queuedAt)}
                  </div>

                  <div className="lr-actions">
                    <Link className="lr-btnSecondary" href="/admin/exports">
                      Ansehen
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }, [state, onRetry]);

  return content;
}
