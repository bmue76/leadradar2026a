"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";

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

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="px-5 py-4">
        <div className="text-base font-semibold tracking-tight text-slate-900">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-500">{subtitle}</div> : null}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
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

function ErrorCallout({ title, message, traceId }: { title: string; message: string; traceId?: string }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
      <div className="text-sm font-semibold text-rose-900">{title}</div>
      <div className="mt-1 text-sm text-rose-900/80">{message}</div>
      {traceId ? <div className="mt-2 text-xs text-rose-900/70">Trace: {traceId}</div> : null}
    </div>
  );
}

export default function MandantClient() {
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
            title: "Mandant konnte nicht geladen werden",
            message: json.error?.message ?? "Unerwarteter Fehler.",
            traceId: json.traceId,
          });
          return;
        }

        setData(json.data);
      } catch {
        if (!alive) return;
        setData(null);
        setErr({ title: "Mandant konnte nicht geladen werden", message: "Netzwerkfehler oder Server nicht erreichbar." });
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

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Mandant</h1>
          <p className="mt-1 text-sm text-slate-500">Mandanteninformationen (read-only) zur Transparenz.</p>
        </div>
        <SecondaryLink href="/admin/organisation">Zur Übersicht</SecondaryLink>
      </div>

      {err ? (
        <ErrorCallout title={err.title} message={err.message} traceId={err.traceId} />
      ) : (
        <Card title="Mandanteninformationen" subtitle="Diese Angaben sind im MVP nicht editierbar.">
          {loading ? (
            <div className="space-y-3">
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
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
                  <dt className="text-slate-500">Owner</dt>
                  <dd className="text-right font-semibold text-slate-900">
                    {data.owner.name ? `${data.owner.name} · ` : ""}
                    {data.owner.email}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-6">
                  <dt className="text-slate-500">Anzahl aktiver Lizenzen</dt>
                  <dd className="text-right font-semibold text-slate-900">{data.activeLicensesCount}</dd>
                </div>
                <div className="flex items-start justify-between gap-6">
                  <dt className="text-slate-500">Erstellungsdatum</dt>
                  <dd className="text-right font-semibold text-slate-900">{formatDateDE(data.tenant.createdAt)}</dd>
                </div>
              </dl>

              <hr className="my-5 border-slate-200" />

              <p className="text-sm text-slate-500">
                Rechnungsdaten finden Sie unter <span className="font-semibold text-slate-900">Abrechnung → Firma &amp; Belege</span>.
              </p>
            </>
          ) : null}
        </Card>
      )}
    </div>
  );
}
