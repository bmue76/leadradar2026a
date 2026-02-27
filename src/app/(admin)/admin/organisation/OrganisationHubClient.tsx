"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";

type OrganisationSummary = {
  tenant: { id: string; name: string; slug: string; createdAt: string };
  owner: { id: string; name: string | null; email: string };
  activeLicensesCount: number;
};

type ApiError = { code: string; message: string; details?: unknown };
type ApiResp<T> = { ok: boolean; data?: T; error?: ApiError; traceId?: string };

function formatDateDE(dateIso: string) {
  const d = new Date(dateIso);
  return new Intl.DateTimeFormat("de-CH", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function shortId(id: string) {
  if (!id) return "";
  return id.length <= 10 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div>
          <div className="text-base font-semibold tracking-tight text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-slate-500">{subtitle}</div> : null}
        </div>
        {right ? <div className="pt-0.5">{right}</div> : null}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
    >
      {children}
    </Link>
  );
}

function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}

function BadgeBeta() {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
      Beta
    </span>
  );
}

function ErrorCallout({ title, message, traceId }: { title: string; message: string; traceId?: string }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
      <div className="text-sm font-semibold text-rose-900">{title}</div>
      <div className="mt-1 text-sm text-rose-900/80">{message}</div>
      {traceId ? <div className="mt-2 text-xs text-rose-900/70">Trace: {traceId}</div> : null}
    </div>
  );
}

export default function OrganisationHubClient() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OrganisationSummary | null>(null);
  const [err, setErr] = useState<{ title: string; message: string; traceId?: string } | null>(null);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setErr(null);

      try {
        const res = await fetch("/api/admin/v1/organisation", { method: "GET", cache: "no-store" });
        const json = (await res.json()) as ApiResp<OrganisationSummary>;

        if (!alive) return;

        if (!json.ok || !json.data) {
          setData(null);
          setErr({
            title: "Organisation konnte nicht geladen werden",
            message: json.error?.message ?? "Unerwarteter Fehler.",
            traceId: json.traceId,
          });
          return;
        }

        setData(json.data);
      } catch {
        if (!alive) return;
        setData(null);
        setErr({
          title: "Organisation konnte nicht geladen werden",
          message: "Netzwerkfehler oder Server nicht erreichbar.",
        });
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, []);

  const supportId = useMemo(() => (data?.tenant?.id ? shortId(data.tenant.id) : ""), [data]);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Organisation</h1>
        <p className="mt-1 text-sm text-slate-500">Struktur und Verantwortlichkeit Ihres Mandanten.</p>
      </div>

      {err ? (
        <ErrorCallout title={err.title} message={err.message} traceId={err.traceId} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card title="Mandant" subtitle="Basisdaten und Zuständigkeit (read-only).">
            {loading ? (
              <div className="space-y-3">
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
                <div className="mt-5 flex justify-end">
                  <div className="h-9 w-32 animate-pulse rounded-full bg-slate-100" />
                </div>
              </div>
            ) : data ? (
              <>
                <dl className="grid grid-cols-1 gap-3 text-sm">
                  <div className="flex items-start justify-between gap-6">
                    <dt className="text-slate-500">Mandantenname</dt>
                    <dd className="text-right font-semibold text-slate-900">{data.tenant.name}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-6">
                    <dt className="text-slate-500">Slug</dt>
                    <dd className="text-right font-semibold text-slate-900">{data.tenant.slug}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-6">
                    <dt className="text-slate-500">Tenant Owner</dt>
                    <dd className="text-right font-semibold text-slate-900">
                      {data.owner.name ? `${data.owner.name} · ` : ""}
                      {data.owner.email}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-6">
                    <dt className="text-slate-500">Erstellt am</dt>
                    <dd className="text-right font-semibold text-slate-900">{formatDateDE(data.tenant.createdAt)}</dd>
                  </div>
                  <div className="pt-1">
                    <p className="text-xs text-slate-500">Support-ID: {supportId}</p>
                  </div>
                </dl>

                <div className="mt-5 flex items-center justify-end">
                  <PrimaryLink href="/admin/organisation/mandant">Details anzeigen</PrimaryLink>
                </div>
              </>
            ) : null}
          </Card>

          <Card title="Mandant übertragen" subtitle="Eigentümerwechsel bei Firmen- oder Verantwortlichkeitsänderung." right={<BadgeBeta />}>
            <p className="text-sm text-slate-500">
              Diese Funktion ist vorbereitet, aber noch nicht aktiv. Sie sehen hier bereits die Struktur für die Testphase.
            </p>

            <div className="mt-5 flex items-center justify-end">
              <SecondaryLink href="/admin/organisation/transfer">Mehr erfahren</SecondaryLink>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
