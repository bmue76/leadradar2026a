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

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("de-CH", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function badge(text: string, tone: "ok" | "warn" | "muted") {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800 border-amber-100"
        : "bg-zinc-50 text-zinc-700 border-zinc-100";
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Abrechnung</h1>
          <p className="mt-1 text-sm text-zinc-600">Lizenz, Credits und Gutscheine.</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
          disabled={loading}
        >
          Aktualisieren
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Lädt…</div>
      ) : !data ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <div className="text-sm text-zinc-800">Keine Daten.</div>
          {err ? <div className="mt-2 text-sm text-red-600">{err}</div> : null}
          {traceId ? <div className="mt-1 text-xs text-zinc-500">TraceId: {traceId}</div> : null}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-zinc-600">Lizenzstatus</div>
                <div className="mt-1 flex items-center gap-2">
                  {badge(meta?.activeText ?? "—", data.entitlement.isActive ? "ok" : "warn")}
                  <span className="text-sm text-zinc-700">gültig bis</span>
                  <span className="text-sm font-medium">{formatDateTime(data.entitlement.validUntil)}</span>
                </div>
                <div className="mt-2 text-sm text-zinc-600">
                  Geräte: <span className="font-medium text-zinc-800">{data.entitlement.activeDevices}</span> /{" "}
                  <span className="font-medium text-zinc-800">{data.entitlement.maxDevices}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => consume("ACTIVATE_LICENSE_30D")}
                  className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
                  disabled={busy !== null}
                >
                  30 Tage aktivieren
                </button>
                <button
                  type="button"
                  onClick={() => consume("ACTIVATE_LICENSE_365D")}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
                  disabled={busy !== null}
                >
                  365 Tage aktivieren
                </button>
                <button
                  type="button"
                  onClick={() => consume("ADD_DEVICE_SLOT")}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
                  disabled={busy !== null}
                >
                  +1 Gerät hinzufügen
                </button>
              </div>
            </div>
            {data.expiringSoon ? (
              <div className="mt-3 text-sm text-amber-700">Hinweis: {data.expiringSoon.count} Credit-Balance(s) läuft/laufen bald ab.</div>
            ) : null}
            {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}
            {traceId ? <div className="mt-1 text-xs text-zinc-500">TraceId: {traceId}</div> : null}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Gutschein einlösen</div>
                <div className="mt-1 text-sm text-zinc-600">Credits werden gutgeschrieben (Verfall gemäss Gutschein, Standard 12 Monate).</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value)}
                  placeholder="CODE"
                  className="w-56 rounded-md border border-zinc-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={redeem}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
                  disabled={busy !== null || !coupon.trim()}
                >
                  Einlösen
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-6 py-4">
              <div className="text-sm font-medium">Credits</div>
            </div>
            <div className="px-6 py-2">
              {data.credits.length === 0 ? (
                <div className="py-4 text-sm text-zinc-600">Keine aktiven Credits.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-zinc-500">
                    <tr>
                      <th className="py-2 text-left font-medium">Typ</th>
                      <th className="py-2 text-right font-medium">Menge</th>
                      <th className="py-2 text-right font-medium">Verfall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.credits.map((c) => (
                      <tr key={`${c.type}-${c.expiresAt}`} className="border-t border-zinc-50">
                        <td className="py-2">{c.type}</td>
                        <td className="py-2 text-right font-medium">{c.quantity}</td>
                        <td className="py-2 text-right">{formatDateTime(c.expiresAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
