"use client";

import React, { useCallback, useEffect, useState } from "react";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type BillingSku = {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  amountCents: number | null;
  grantLicense30d: number;
  grantLicense365d: number;
  grantDeviceSlots: number;
  creditExpiresInDays: number;
};

type PackagesApi = { items: BillingSku[] };
type CheckoutApi = { checkoutUrl: string };

function fmtMoney(currency: string, amountCents: number): string {
  try {
    return new Intl.NumberFormat("de-CH", { style: "currency", currency }).format(amountCents / 100);
  } catch {
    return `${currency} ${amountCents}`;
  }
}

function includesText(s: BillingSku): string {
  const parts: string[] = [];
  if (s.grantLicense30d > 0) parts.push(`${s.grantLicense30d}× 30 Tage`);
  if (s.grantLicense365d > 0) parts.push(`${s.grantLicense365d}× 365 Tage`);
  if (s.grantDeviceSlots > 0) parts.push(`+${s.grantDeviceSlots} Geräte-Slot`);
  return parts.length ? parts.join(" · ") : "—";
}

export default function PackagesScreenClient() {
  const [items, setItems] = useState<BillingSku[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setTraceId(null);

    try {
      const res = await fetch("/api/admin/v1/billing/packages", { cache: "no-store" });
      const json = (await res.json()) as ApiResp<PackagesApi>;
      if (!json.ok) {
        setErr(json.error.message);
        setTraceId(json.traceId);
        setItems([]);
      } else {
        setItems(json.data.items ?? []);
      }
    } catch {
      setErr("Netzwerkfehler.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const buy = useCallback(async (skuId: string) => {
    setBusy(skuId);
    setErr(null);
    setTraceId(null);

    try {
      const res = await fetch("/api/admin/v1/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skuId }),
      });
      const json = (await res.json()) as ApiResp<CheckoutApi>;
      if (!json.ok) {
        setErr(json.error.message);
        setTraceId(json.traceId);
        return;
      }

      window.location.assign(json.data.checkoutUrl);
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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <header className="mb-4">
        <div className="text-sm font-semibold text-slate-900">Pakete</div>
        <div className="mt-1 text-sm text-slate-600">Kauf via Stripe (one-time). Credits verfallen standardmässig nach 12 Monaten.</div>
      </header>

      {items.length === 0 ? (
        <div className="text-sm text-slate-600">Keine Pakete verfügbar.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-sm font-semibold text-slate-900">{p.name}</div>
              {p.description ? <div className="mt-1 text-sm text-slate-600">{p.description}</div> : null}

              <div className="mt-3 text-sm text-slate-600">
                <div className="font-medium text-slate-900">Enthält</div>
                <div className="mt-1">{includesText(p)}</div>
                <div className="mt-2 text-xs text-slate-500">Verfall: {p.creditExpiresInDays} Tage</div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">
                  {p.amountCents != null ? fmtMoney(p.currency, p.amountCents) : "Preis im Checkout"}
                </div>
                <button
                  type="button"
                  onClick={() => void buy(p.id)}
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  disabled={busy !== null}
                >
                  Kaufen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {err ? <div className="mt-4 text-sm text-rose-700">{err}</div> : null}
      {traceId ? <div className="mt-1 text-xs text-slate-500">TraceId: {traceId}</div> : null}

      <div className="mt-5">
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          Aktualisieren
        </button>
      </div>
    </section>
  );
}
