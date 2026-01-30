"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type BillingOverview = {
  entitlement: {
    validUntil: string | null;
    isActive: boolean;
    maxDevices: number;
    activeDevices: number;
  };
  credits: Array<{ type: "LICENSE_30D" | "LICENSE_365D" | "DEVICE_SLOT"; quantity: number; expiresAt: string }>;
  expiringSoon: { count: number } | null;
};

function RefreshIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M20 12a8 8 0 0 1-14.7 4.5M4 12A8 8 0 0 1 18.7 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M18 4v4h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 20v-4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("de-CH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function badge(text: string, tone: "ok" | "warn" | "muted") {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800 border-amber-100"
        : "bg-slate-50 text-slate-700 border-slate-200";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}>{text}</span>;
}

export default function BillingScreenClient() {
  const [data, setData] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [coupon, setCoupon] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);

  const meta = useMemo(() => {
    if (!data) return null;
    return { activeText: data.entitlement.isActive ? "Aktiv" : "Inaktiv" };
  }, [data]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setTraceId(null);
    try {
      const res = await fetch("/api/admin/v1/billing/overview", { cache: "no-store" });
      const json = (await res.json()) as ApiResp<BillingOverview>;
      if (!json.ok) {
        setErr(json.error.message);
        setTraceId(json.traceId);
        setData(null);
      } else {
        setData(json.data);
      }
    } catch {
      setErr("Netzwerkfehler.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const redeem = useCallback(async () => {
    const code = coupon.trim();
    if (!code) return;

    setBusy("redeem");
    setErr(null);
    setTraceId(null);
    try {
      const res = await fetch("/api/admin/v1/billing/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = (await res.json()) as ApiResp<BillingOverview>;
      if (!json.ok) {
        setErr(json.error.message);
        setTraceId(json.traceId);
      } else {
        setData(json.data);
        setCoupon("");
      }
    } catch {
      setErr("Netzwerkfehler.");
    } finally {
      setBusy(null);
    }
  }, [coupon]);

  const consume = useCallback(async (action: "ACTIVATE_LICENSE_30D" | "ACTIVATE_LICENSE_365D" | "ADD_DEVICE_SLOT") => {
    setBusy(action);
    setErr(null);
    setTraceId(null);
    try {
      const res = await fetch("/api/admin/v1/billing/consume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as ApiResp<BillingOverview>;
      if (!json.ok) {
        setErr(json.error.message);
        setTraceId(json.traceId);
      } else {
        setData(json.data);
      }
    } catch {
      setErr("Netzwerkfehler.");
    } finally {
      setBusy(null);
    }
  }, []);

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="text-sm text-slate-600">Lade…</div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="text-sm text-slate-900">Keine Daten.</div>
        {err ? <div className="mt-2 text-sm text-red-600">{err}</div> : null}
        {traceId ? <div className="mt-1 text-xs text-slate-500">TraceId: {traceId}</div> : null}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Lizenz / Entitlement */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm font-medium text-slate-900">Lizenz & Geräte</div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => consume("ACTIVATE_LICENSE_30D")}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                disabled={busy !== null}
              >
                30 Tage aktivieren
              </button>
              <button
                type="button"
                onClick={() => consume("ACTIVATE_LICENSE_365D")}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                disabled={busy !== null}
              >
                365 Tage aktivieren
              </button>
              <button
                type="button"
                onClick={() => consume("ADD_DEVICE_SLOT")}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                disabled={busy !== null}
              >
                +1 Gerät
              </button>

              <button
                type="button"
                onClick={load}
                className="grid h-9 w-9 place-items-center rounded-xl hover:bg-slate-100 disabled:opacity-50"
                aria-label="Aktualisieren"
                disabled={busy !== null}
              >
                <RefreshIcon className="h-4 w-4 text-slate-600" />
              </button>
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-slate-200" />

        <div className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            {badge(meta?.activeText ?? "—", data.entitlement.isActive ? "ok" : "warn")}
            <span className="text-sm text-slate-600">gültig bis</span>
            <span className="text-sm font-medium text-slate-900">{formatDateTime(data.entitlement.validUntil)}</span>
          </div>

          <div className="mt-2 text-sm text-slate-600">
            Geräte: <span className="font-medium text-slate-900">{data.entitlement.activeDevices}</span> /{" "}
            <span className="font-medium text-slate-900">{data.entitlement.maxDevices}</span>
          </div>

          {data.expiringSoon ? (
            <div className="mt-3 text-sm text-amber-700">Hinweis: {data.expiringSoon.count} Credit-Balance(s) läuft/laufen bald ab.</div>
          ) : null}

          {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}
          {traceId ? <div className="mt-1 text-xs text-slate-500">TraceId: {traceId}</div> : null}
        </div>
      </section>

      {/* Gutschein */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="text-sm font-medium text-slate-900">Gutschein einlösen</div>
              <div className="mt-1 text-sm text-slate-600">Credits werden gutgeschrieben (Standard-Verfall 12 Monate).</div>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <input
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                placeholder="CODE"
                className="h-9 w-56 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              />
              <button
                type="button"
                onClick={redeem}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                disabled={busy !== null || !coupon.trim()}
              >
                Einlösen
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Credits Table */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="p-5">
          <div className="text-sm font-medium text-slate-900">Credits</div>
        </div>

        <div className="h-px w-full bg-slate-200" />

        <div className="p-6">
          {data.credits.length === 0 ? (
            <div className="text-sm text-slate-600">Keine aktiven Credits.</div>
          ) : (
            <table className="w-full table-auto text-sm">
              <thead className="text-xs font-semibold text-slate-600">
                <tr>
                  <th className="pb-3 text-left">Typ</th>
                  <th className="pb-3 text-right">Menge</th>
                  <th className="pb-3 text-right">Verfall</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.credits.map((c) => (
                  <tr key={`${c.type}-${c.expiresAt}`} className="hover:bg-slate-50">
                    <td className="py-3">{c.type}</td>
                    <td className="py-3 text-right font-medium text-slate-900">{c.quantity}</td>
                    <td className="py-3 text-right">{formatDateTime(c.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
