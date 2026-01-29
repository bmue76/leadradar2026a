"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ReadinessLevel = "OK" | "WARN" | "BLOCK";
type ActivityType =
  | "LEAD_CREATED"
  | "EXPORT_CREATED"
  | "DEVICE_CONNECTED"
  | "EVENT_ACTIVATED"
  | "FORM_ASSIGNED";

type Summary = {
  me: { givenName: string | null };
  tenant: {
    id: string;
    slug: string;
    displayName: string;
    logoUrl: string | null;
    accentColor: string | null;
  };
  activeEvent: null | {
    id: string;
    name: string;
    status: "ACTIVE";
    startsAt: string | null;
    endsAt: string | null;
  };
  readiness: {
    overall: ReadinessLevel;
    items: Array<{
      id:
        | "ACTIVE_EVENT_PRESENT"
        | "ACTIVE_FORMS_ASSIGNED_TO_ACTIVE_EVENT"
        | "AT_LEAST_ONE_DEVICE_CONNECTED"
        | "LICENSE_VALID";
      level: ReadinessLevel;
      title: string;
      detail: string;
      action?: { label: string; href: string };
    }>;
  };
  quickActions: Array<{
    id: "GO_TO_ACTIVE_EVENT" | "CREATE_OR_ACTIVATE_EVENT" | "CREATE_FORM" | "CONNECT_DEVICE" | "EXPORT_LEADS";
    label: string;
    href: string;
    kind: "primary" | "secondary";
    disabled?: boolean;
  }>;
  kpisToday: {
    leadsCaptured: number;
    businessCardsCaptured: number;
    exportsCreated: number;
  };
  kpisThisWeek: { leadsCaptured: number };
  recentActivity: Array<{
    id: string;
    type: ActivityType;
    at: string;
    title: string;
    href?: string;
  }>;
};

type ApiOk = { ok: true; data: Summary; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp = ApiOk | ApiErr;

function fmtDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function levelLabel(level: ReadinessLevel): string {
  if (level === "OK") return "OK";
  if (level === "WARN") return "Hinweis";
  return "Blockiert";
}

function overallLabel(level: ReadinessLevel): string {
  if (level === "OK") return "Bereit";
  if (level === "WARN") return "Fast bereit";
  return "Nicht bereit";
}

function ActionButton({
  label,
  href,
  kind,
  disabled,
}: {
  label: string;
  href: string;
  kind: "primary" | "secondary";
  disabled?: boolean;
}) {
  const cls = kind === "primary" ? "lr-btn" : "lr-btnSecondary";
  if (disabled) {
    return (
      <span className={cls} aria-disabled="true" title="Aktuell nicht verfügbar">
        {label}
      </span>
    );
  }
  return (
    <Link className={cls} href={href}>
      {label}
    </Link>
  );
}

export function AdminHomeOverview() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null);

  const headline = useMemo(() => {
    const given = data?.me.givenName?.trim() ?? "";
    return given ? `Grüezi ${given}` : "Grüezi";
  }, [data]);

  const subline = useMemo(() => {
    if (!data) return "";
    if (!data.activeEvent) return "Kein aktives Event";
    return `${data.activeEvent.name} • AKTIVES EVENT`;
  }, [data]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/v1/home/summary", { method: "GET", cache: "no-store" });
      const json = (await res.json()) as ApiResp;

      if (!json || typeof json !== "object") {
        setError({ message: "Ungültige Serverantwort." });
        setData(null);
        setLoading(false);
        return;
      }

      if (json.ok) {
        setData(json.data);
        setError(null);
        setLoading(false);
        return;
      }

      setData(null);
      setError({
        message: json.error?.message || "Übersicht konnte nicht geladen werden.",
        code: json.error?.code,
        traceId: json.traceId,
      });
      setLoading(false);
    } catch {
      setData(null);
      setError({
        message: "Übersicht konnte nicht geladen werden. Bitte erneut versuchen.",
      });
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint rule: avoid setState synchronously within effect.
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  if (loading) {
    return (
      <div className="lr-page" aria-busy="true">
        <header className="lr-pageHeader">
          <h1 className="lr-h1">Grüezi</h1>
          <p className="lr-muted">Lade Übersicht …</p>
        </header>

        <section className="lr-grid">
          <div className="lr-panel">
            <div className="lr-panelHeader">
              <h2 className="lr-h2">Einsatzbereitschaft</h2>
              <p className="lr-muted">Prüfe die wichtigsten Punkte für den Messebetrieb.</p>
            </div>
            <div className="lr-list">
              <div className="lr-listItem">
                <div className="lr-listTitle">Lade …</div>
                <div className="lr-muted">Bitte einen Moment.</div>
              </div>
            </div>
          </div>

          <div className="lr-panel">
            <div className="lr-panelHeader">
              <h2 className="lr-h2">Schnellaktionen</h2>
              <p className="lr-muted">Direkt zu den wichtigsten Bereichen.</p>
            </div>
            <div className="lr-actions">
              <span className="lr-btnSecondary" aria-disabled="true">
                Lade …
              </span>
            </div>
          </div>

          <div className="lr-panel">
            <div className="lr-panelHeader">
              <h2 className="lr-h2">Heute</h2>
              <p className="lr-muted">Minimal-KPIs für den aktuellen Tag.</p>
            </div>
            <div className="lr-grid">
              <div className="lr-card">
                <div className="lr-cardTitle">Leads erfasst</div>
                <div className="lr-cardDesc">—</div>
              </div>
              <div className="lr-card">
                <div className="lr-cardTitle">Mit Visitenkarte</div>
                <div className="lr-cardDesc">—</div>
              </div>
              <div className="lr-card">
                <div className="lr-cardTitle">Exporte</div>
                <div className="lr-cardDesc">—</div>
              </div>
            </div>
          </div>

          <div className="lr-panel">
            <div className="lr-panelHeader">
              <h2 className="lr-h2">Letzte Aktivitäten</h2>
              <p className="lr-muted">Was zuletzt passiert ist.</p>
            </div>
            <div className="lr-list">
              <div className="lr-listItem">
                <div className="lr-listTitle">Lade …</div>
                <div className="lr-muted">Bitte einen Moment.</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lr-page">
        <header className="lr-pageHeader">
          <h1 className="lr-h1">Übersicht</h1>
          <p className="lr-muted">Ein ruhiger Fehlerzustand – nichts ist kaputt, wir versuchen es nochmals.</p>
        </header>

        <section className="lr-panel">
          <div className="lr-panelHeader">
            <h2 className="lr-h2">Konnte nicht laden</h2>
            <p className="lr-muted">{error.message}</p>
            {error.code || error.traceId ? (
              <p className="lr-muted">
                {error.code ? `Code: ${error.code}` : null}
                {error.code && error.traceId ? " • " : null}
                {error.traceId ? `Trace: ${error.traceId}` : null}
              </p>
            ) : null}
          </div>

          <div className="lr-actions">
            <button className="lr-btn" type="button" onClick={() => void load()}>
              Erneut versuchen
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="lr-page">
        <header className="lr-pageHeader">
          <h1 className="lr-h1">Übersicht</h1>
          <p className="lr-muted">Keine Daten verfügbar.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="lr-page">
      <header className="lr-pageHeader">
        <h1 className="lr-h1">{headline}</h1>
        <p className="lr-muted">{subline}</p>
      </header>

      <section className="lr-grid">
        <div className="lr-panel">
          <div className="lr-panelHeader">
            <h2 className="lr-h2">Einsatzbereitschaft</h2>
            <p className="lr-muted">
              Status: <strong>{overallLabel(data.readiness.overall)}</strong>
            </p>
          </div>

          <div className="lr-list">
            {data.readiness.items.map((it) => (
              <div key={it.id} className="lr-listItem">
                <div className="lr-listTitle">
                  {it.title} <span className="lr-muted">• {levelLabel(it.level)}</span>
                </div>
                <div className="lr-muted">{it.detail}</div>
                {it.action ? (
                  <div className="lr-actions">
                    <Link className="lr-btnSecondary" href={it.action.href}>
                      {it.action.label}
                    </Link>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="lr-panel">
          <div className="lr-panelHeader">
            <h2 className="lr-h2">Schnellaktionen</h2>
            <p className="lr-muted">Direkt zu den wichtigsten Bereichen.</p>
          </div>

          <div className="lr-actions">
            {data.quickActions.map((a) => (
              <ActionButton key={a.id} label={a.label} href={a.href} kind={a.kind} disabled={a.disabled} />
            ))}
          </div>

          <div className="lr-muted" style={{ marginTop: 10 }}>
            Diese Übersicht berücksichtigt Option 2: Mobile zeigt nur ACTIVE Formulare, die dem aktiven Event zugewiesen sind.
          </div>
        </div>

        <div className="lr-panel">
          <div className="lr-panelHeader">
            <h2 className="lr-h2">Heute</h2>
            <p className="lr-muted">Minimal-KPIs für den aktuellen Tag.</p>
          </div>

          <div className="lr-grid">
            <div className="lr-card" aria-label="Leads erfasst">
              <div className="lr-cardTitle">Leads erfasst</div>
              <div className="lr-cardDesc">{data.kpisToday.leadsCaptured}</div>
              <div className="lr-cardHint">Woche: {data.kpisThisWeek.leadsCaptured}</div>
            </div>

            <div className="lr-card" aria-label="Mit Visitenkarte">
              <div className="lr-cardTitle">Mit Visitenkarte</div>
              <div className="lr-cardDesc">{data.kpisToday.businessCardsCaptured}</div>
              <div className="lr-cardHint">BUSINESS_CARD_IMAGE</div>
            </div>

            <div className="lr-card" aria-label="Exporte">
              <div className="lr-cardTitle">Exporte</div>
              <div className="lr-cardDesc">{data.kpisToday.exportsCreated}</div>
              <div className="lr-cardHint">CSV Jobs</div>
            </div>
          </div>
        </div>

        <div className="lr-panel">
          <div className="lr-panelHeader">
            <h2 className="lr-h2">Letzte Aktivitäten</h2>
            <p className="lr-muted">Was zuletzt passiert ist.</p>
          </div>

          {data.recentActivity.length <= 0 ? (
            <div className="lr-list">
              <div className="lr-listItem">
                <div className="lr-listTitle">Noch keine Aktivitäten</div>
                <div className="lr-muted">Sobald Leads erfasst oder Geräte aktiv sind, erscheint hier eine Liste.</div>
              </div>
            </div>
          ) : (
            <div className="lr-list">
              {data.recentActivity.map((a) => (
                <div key={a.id} className="lr-listItem">
                  <div className="lr-listTitle">{a.title}</div>
                  <div className="lr-muted">{fmtDateTime(a.at)}</div>
                  {a.href ? (
                    <div className="lr-actions">
                      <Link className="lr-btnSecondary" href={a.href}>
                        Ansehen
                      </Link>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
