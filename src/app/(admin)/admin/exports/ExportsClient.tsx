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

function mapStatusLabel(s: ExportItem["status"]): string {
  if (s === "DONE") return "Abgeschlossen";
  if (s === "FAILED") return "Fehlgeschlagen";
  if (s === "RUNNING") return "Läuft";
  return "Erstellt";
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("de-CH", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Skeleton() {
  return (
    <div className="lr-page">
      <header className="lr-pageHeader">
        <h1 className="lr-h1">Exports</h1>
        <p className="lr-muted">CSV-Exporte erstellen und herunterladen.</p>
      </header>

      <section className="lr-panel">
        <div className="lr-panelHeader">
          <h2 className="lr-h2">Übersicht</h2>
          <p className="lr-muted">Lade Daten…</p>
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
        <p className="lr-muted">
          Sobald ihr Leads erfasst habt, könnt ihr hier einen CSV-Export erstellen und herunterladen.
        </p>
      </div>

      <div className="lr-actions">
        <Link className="lr-btn" href="/admin/leads">Zu den Leads</Link>
        <Link className="lr-btnSecondary" href="/admin">Übersicht</Link>
        <Link className="lr-btnSecondary" href="/admin/forms">Formulare prüfen</Link>
      </div>

      <p className="lr-muted" style={{ marginTop: 12 }}>
        Tipp: Für Mobile braucht’s <strong>ACTIVE</strong> Formulare, die dem aktiven Event zugewiesen sind (Option 2).
      </p>
    </section>
  );
}

function EmptyStateNoExportsYet() {
  return (
    <section className="lr-panel">
      <div className="lr-panelHeader">
        <h2 className="lr-h2">Noch kein Export erstellt</h2>
        <p className="lr-muted">
          Ihr habt bereits Leads erfasst. Sobald die Export-Funktion aktiviert ist, erscheinen hier eure CSV-Jobs.
        </p>
      </div>

      <div className="lr-actions">
        <Link className="lr-btn" href="/admin/leads">Leads ansehen</Link>
        <Link className="lr-btnSecondary" href="/admin">Übersicht</Link>
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

  useEffect(() => {
    void load();
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
            <p className="lr-muted">CSV-Exporte erstellen und herunterladen.</p>
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
                  <Link className="lr-btnSecondary" href="/admin">Übersicht</Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      );
    }

    // READY
    const { items, leadsTotal } = state;

    return (
      <div className="lr-page">
        <header className="lr-pageHeader">
          <h1 className="lr-h1">Exports</h1>
          <p className="lr-muted">CSV-Exporte erstellen und herunterladen.</p>
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
              <p className="lr-muted">Übersicht über eure letzten CSV-Jobs.</p>
            </div>

            <div className="lr-list">
              {items.map((it) => (
                <div key={it.id} className="lr-listItem">
                  <div className="lr-listTitle">
                    CSV • {mapStatusLabel(it.status)}
                  </div>
                  <div className="lr-muted">Erstellt: {formatWhen(it.queuedAt)}</div>
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
