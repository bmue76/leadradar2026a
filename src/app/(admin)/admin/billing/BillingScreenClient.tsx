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

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function Badge({ text, tone }: { text: string; tone: "ok" | "warn" | "muted" }) {
  const cls =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${cls}`}>{text}</span>;
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
      setData(null);
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
        {err ? <div className="mt-2 text-sm text-rose-700">{err}</div> : null}
        {traceId ? <div className="mt-1 text-xs text-slate-500">TraceId: {traceId}</div> : null}
        <div className="mt-4">
          <button
            type="button"
            onClick={load}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Aktualisieren
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* Lizenz / Device Slots */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm text-slate-600">Lizenzstatus</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge text={meta?.activeText ?? "—"} tone={data.entitlement.isActive ? "ok" : "warn"} />
              <span className="text-sm text-slate-600">gültig bis</span>
              <span className="text-sm font-semibold text-slate-900">{fmtDateTime(data.entitlement.validUntil)}</span>
            </div>
            <div className="mt-2 text-sm text-slate-600">
              Geräte: <span className="font-semibold text-slate-900">{data.entitlement.activeDevices}</span> /{" "}
              <span className="font-semibold text-slate-900">{data.entitlement.maxDevices}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => consume("ACTIVATE_LICENSE_30D")}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              disabled={busy !== null}
            >
              30 Tage aktivieren
            </button>

            <button
              type="button"
              onClick={() => consume("ACTIVATE_LICENSE_365D")}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
              disabled={busy !== null}
            >
              365 Tage aktivieren
            </button>

            <button
              type="button"
              onClick={() => consume("ADD_DEVICE_SLOT")}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
              disabled={busy !== null}
            >
              +1 Gerät hinzufügen
            </button>

            <button
              type="button"
              onClick={load}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
              aria-label="Aktualisieren"
              title="Aktualisieren"
              disabled={busy !== null}
            >
              ↻
            </button>
          </div>
        </div>

        {data.expiringSoon ? (
          <div className="mt-3 text-sm text-amber-800">
            Hinweis: {data.expiringSoon.count} Credit-Balance(s) läuft/laufen bald ab.
          </div>
        ) : null}

        {err ? <div className="mt-3 text-sm text-rose-700">{err}</div> : null}
        {traceId ? <div className="mt-1 text-xs text-slate-500">TraceId: {traceId}</div> : null}
      </section>

      {/* Gutschein */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Gutschein einlösen</div>
              <div className="mt-1 text-sm text-slate-600">
                Credits werden gutgeschrieben (Verfall gemäss Gutschein, Standard 12 Monate).
              </div>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <input
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                placeholder="CODE"
                className="h-9 w-56 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <button
                type="button"
                onClick={redeem}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
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
          <div className="text-sm font-semibold text-slate-900">Credits</div>
        </div>

        <div className="h-px w-full bg-slate-200" />

        <div className="p-6 pt-4">
          {data.credits.length === 0 ? (
            <div className="text-sm text-slate-600">Keine aktiven Credits.</div>
          ) : (
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-600">
                  <th className="py-2">Typ</th>
                  <th className="py-2 text-right">Menge</th>
                  <th className="py-2 text-right">Verfall</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.credits.map((c) => (
                  <tr key={`${c.type}-${c.expiresAt}`} className="hover:bg-slate-50">
                    <td className="py-3 font-medium text-slate-900">{c.type}</td>
                    <td className="py-3 text-right font-semibold text-slate-900">{c.quantity}</td>
                    <td className="py-3 text-right text-slate-700">{fmtDateTime(c.expiresAt)}</td>
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
