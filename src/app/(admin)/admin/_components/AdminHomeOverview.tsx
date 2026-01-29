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
    at: string; // ISO
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

function overallLabel(level: ReadinessLevel): string {
  if (level === "OK") return "Bereit";
  if (level === "WARN") return "Fast bereit";
  return "Nicht bereit";
}

function badgeClasses(level: ReadinessLevel): string {
  if (level === "OK") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (level === "WARN") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-900";
}

function badgeText(level: ReadinessLevel): string {
  if (level === "OK") return "OK";
  if (level === "WARN") return "Hinweis";
  return "Blockiert";
}

function ButtonLink({
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
  const base =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200";
  const primary = "bg-slate-900 text-white hover:bg-slate-800";
  const secondary = "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50";

  const cls = `${base} ${kind === "primary" ? primary : secondary} ${disabled ? "opacity-50 pointer-events-none" : ""}`;

  return (
    <Link className={cls} href={href} aria-disabled={disabled ? "true" : "false"}>
      {label}
    </Link>
  );
}

function CardShell({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
          {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
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
      setError({ message: "Übersicht konnte nicht geladen werden. Bitte erneut versuchen." });
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        <div className="mb-6">
          <div className="h-9 w-40 rounded-lg bg-slate-100 animate-pulse" />
          <div className="mt-2 h-5 w-64 rounded-lg bg-slate-100 animate-pulse" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="h-5 w-48 rounded bg-slate-100 animate-pulse" />
            <div className="mt-3 space-y-2">
              <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
              <div className="h-4 w-5/6 rounded bg-slate-100 animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-slate-100 animate-pulse" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="h-5 w-40 rounded bg-slate-100 animate-pulse" />
            <div className="mt-4 flex flex-wrap gap-2">
              <div className="h-9 w-36 rounded-xl bg-slate-100 animate-pulse" />
              <div className="h-9 w-32 rounded-xl bg-slate-100 animate-pulse" />
              <div className="h-9 w-28 rounded-xl bg-slate-100 animate-pulse" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
            <div className="h-5 w-16 rounded bg-slate-100 animate-pulse" />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="h-20 rounded-2xl border border-slate-200 bg-slate-50 animate-pulse" />
              <div className="h-20 rounded-2xl border border-slate-200 bg-slate-50 animate-pulse" />
              <div className="h-20 rounded-2xl border border-slate-200 bg-slate-50 animate-pulse" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
            <div className="h-5 w-40 rounded bg-slate-100 animate-pulse" />
            <div className="mt-3 space-y-2">
              <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
              <div className="h-4 w-5/6 rounded bg-slate-100 animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-slate-100 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Übersicht</h1>
        <p className="mt-2 text-sm text-slate-600">
          Ein ruhiger Fehlerzustand – nichts ist kaputt, wir versuchen es nochmals.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-base font-semibold text-slate-900">Konnte nicht laden</div>
          <div className="mt-1 text-sm text-slate-600">{error.message}</div>

          {(error.code || error.traceId) && (
            <div className="mt-2 text-xs text-slate-500">
              {error.code ? `Code: ${error.code}` : null}
              {error.code && error.traceId ? " • " : null}
              {error.traceId ? `Trace: ${error.traceId}` : null}
            </div>
          )}

          <div className="mt-4">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
              onClick={() => void load()}
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Übersicht</h1>
        <p className="mt-2 text-sm text-slate-600">Keine Daten verfügbar.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{headline}</h1>
        <p className="mt-2 text-sm text-slate-600">{subline}</p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CardShell
          title="Einsatzbereitschaft"
          subtitle={
            <>
              Status: <span className="font-semibold text-slate-900">{overallLabel(data.readiness.overall)}</span>
            </>
          }
        >
          <div className="divide-y divide-slate-100">
            {data.readiness.items.map((it) => (
              <div key={it.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{it.title}</div>
                    <div className="mt-1 text-sm text-slate-600">{it.detail}</div>
                    {it.action ? (
                      <div className="mt-3">
                        <ButtonLink label={it.action.label} href={it.action.href} kind="secondary" />
                      </div>
                    ) : null}
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-xs font-medium ${badgeClasses(
                      it.level
                    )}`}
                    aria-label={badgeText(it.level)}
                    title={badgeText(it.level)}
                  >
                    {badgeText(it.level)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardShell>

        <CardShell
          title="Schnellaktionen"
          subtitle="Direkt zu den wichtigsten Bereichen."
          right={<span className="text-xs text-slate-500">Option 2</span>}
        >
          <div className="flex flex-wrap gap-2">
            {data.quickActions.map((a) => (
              <ButtonLink key={a.id} label={a.label} href={a.href} kind={a.kind} disabled={a.disabled} />
            ))}
          </div>

          <div className="mt-4 text-xs text-slate-500">
            Mobile zeigt nur <span className="font-medium">ACTIVE</span> Formulare, die dem aktiven Event zugewiesen sind.
          </div>
        </CardShell>

        <CardShell title="Heute" subtitle="Minimal-KPIs für den aktuellen Tag.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Leads erfasst</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{data.kpisToday.leadsCaptured}</div>
              <div className="mt-1 text-xs text-slate-600">Diese Woche: {data.kpisThisWeek.leadsCaptured}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Mit Visitenkarte</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{data.kpisToday.businessCardsCaptured}</div>
              <div className="mt-1 text-xs text-slate-600">Visitenkarten (Scan/Upload)</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Exporte</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{data.kpisToday.exportsCreated}</div>
              <div className="mt-1 text-xs text-slate-600">CSV Jobs</div>
            </div>
          </div>
        </CardShell>

        <CardShell title="Letzte Aktivitäten" subtitle="Was zuletzt passiert ist.">
          {data.recentActivity.length <= 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Noch keine Aktivitäten</div>
              <div className="mt-1 text-sm text-slate-600">
                Sobald Leads erfasst oder Geräte aktiv sind, erscheint hier eine Liste.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentActivity.map((a) => (
                <div key={a.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{a.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{fmtDateTime(a.at)}</div>
                    </div>
                    {a.href ? (
                      <Link
                        className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                        href={a.href}
                      >
                        Ansehen
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardShell>
      </div>
    </div>
  );
}
