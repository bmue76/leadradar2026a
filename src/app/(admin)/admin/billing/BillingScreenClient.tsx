"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

type BillingSku = {
  id: string;
  name: string;
  description: string | null;
  stripePriceId: string;
  currency: string;
  amountCents: number | null;
  grantLicense30d: number;
  grantLicense365d: number;
  grantDeviceSlots: number;
  creditExpiresInDays: number;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type PackagesApi = { items: BillingSku[] };
type CheckoutApi = { checkoutUrl: string };

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtMoney(currency: string, amountCents: number): string {
  try {
    return new Intl.NumberFormat("de-CH", { style: "currency", currency }).format(amountCents / 100);
  } catch {
    return `${currency} ${amountCents}`;
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

function Banner({ tone, title, text }: { tone: "ok" | "warn"; title: string; text: string }) {
  const cls =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <section className={`rounded-2xl border p-4 ${cls}`}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-sm opacity-90">{text}</div>
    </section>
  );
}

function skuIncludes(s: BillingSku): string {
  const parts: string[] = [];
  if (s.grantLicense30d > 0) parts.push(`${s.grantLicense30d}× 30 Tage`);
  if (s.grantLicense365d > 0) parts.push(`${s.grantLicense365d}× 365 Tage`);
  if (s.grantDeviceSlots > 0) parts.push(`+${s.grantDeviceSlots} Geräte-Slot`);
  if (parts.length === 0) return "—";
  return parts.join(" · ");
}

function creditTypeLabel(t: BillingOverview["credits"][number]["type"]) {
  if (t === "LICENSE_30D") return "Lizenz 30 Tage";
  if (t === "LICENSE_365D") return "Lizenz 365 Tage";
  return "Geräte-Slot";
}

export default function BillingScreenClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<BillingOverview | null>(null);
  const [pkgs, setPkgs] = useState<BillingSku[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPkgs, setLoadingPkgs] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [coupon, setCoupon] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [banner, setBanner] = useState<null | { tone: "ok" | "warn"; title: string; text: string }>(null);

  const activeText = data?.entitlement.isActive ? "Aktiv" : "Inaktiv";

  const creditSummary = useMemo(() => {
    if (!data) return [];
    const byType = new Map<BillingOverview["credits"][number]["type"], number>();
    for (const c of data.credits) byType.set(c.type, (byType.get(c.type) ?? 0) + (c.quantity ?? 0));

    const order: Array<BillingOverview["credits"][number]["type"]> = ["LICENSE_30D", "LICENSE_365D", "DEVICE_SLOT"];
    return order.map((t) => ({ type: t, qty: byType.get(t) ?? 0 })).filter((x) => x.qty > 0);
  }, [data]);

  const has30 = useMemo(() => (creditSummary.find((x) => x.type === "LICENSE_30D")?.qty ?? 0) > 0, [creditSummary]);
  const has365 = useMemo(() => (creditSummary.find((x) => x.type === "LICENSE_365D")?.qty ?? 0) > 0, [creditSummary]);

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

  const loadPackages = useCallback(async () => {
    setLoadingPkgs(true);
    setErr(null);
    setTraceId(null);

    try {
      const res = await fetch("/api/admin/v1/billing/packages", { cache: "no-store" });
      const json = (await res.json()) as ApiResp<PackagesApi>;
      if (!json.ok) {
        setErr(json.error.message);
        setTraceId(json.traceId);
        setPkgs([]);
      } else {
        const items = (json.data.items ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        setPkgs(items);
      }
    } catch {
      setErr("Netzwerkfehler.");
      setPkgs([]);
    } finally {
      setLoadingPkgs(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadPackages();
  }, [load, loadPackages]);

  useEffect(() => {
    const v = searchParams.get("checkout");
    if (!v) return;

    if (v === "success") {
      setBanner({
        tone: "ok",
        title: "Danke!",
        text: "Der Kauf war erfolgreich. Credits wurden gutgeschrieben (oder sind in Kürze sichtbar).",
      });
      void load();
    } else if (v === "cancel") {
      setBanner({
        tone: "warn",
        title: "Checkout abgebrochen",
        text: "Der Checkout wurde abgebrochen. Es wurden keine Credits gutgeschrieben.",
      });
    }

    const t = window.setTimeout(() => {
      router.replace("/admin/billing");
    }, 900);

    return () => window.clearTimeout(t);
  }, [searchParams, router, load]);

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

  const buy = useCallback(async (skuId: string) => {
    setBusy(`buy:${skuId}`);
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
    <>
      {banner ? <Banner tone={banner.tone} title={banner.title} text={banner.text} /> : null}

      {/* Lizenzstatus (oben) + verfügbare Credits als Chips */}
      <section className={`${banner ? "mt-4" : ""} rounded-2xl border border-slate-200 bg-white`}>
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm text-slate-600">Lizenzstatus</div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge text={activeText ?? "—"} tone={data.entitlement.isActive ? "ok" : "warn"} />
                <span className="text-sm text-slate-600">gültig bis</span>
                <span className="text-sm font-semibold text-slate-900">{fmtDateTime(data.entitlement.validUntil)}</span>
              </div>

              <div className="mt-2 text-sm text-slate-600">
                Geräte: <span className="font-semibold text-slate-900">{data.entitlement.activeDevices}</span> /{" "}
                <span className="font-semibold text-slate-900">{data.entitlement.maxDevices}</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span>Verfügbare Credits:</span>
                {creditSummary.length === 0 ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  creditSummary.map((c) => <Badge key={c.type} text={`${creditTypeLabel(c.type)} ${c.qty}`} tone="muted" />)
                )}
              </div>

              {data.expiringSoon ? (
                <div className="mt-3 text-sm text-amber-800">
                  Hinweis: {data.expiringSoon.count} Credit-Balance(s) läuft/laufen bald ab.
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => consume("ACTIVATE_LICENSE_30D")}
                className="inline-flex h-9 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                disabled={busy !== null || !has30}
                title={!has30 ? "Keine 30-Tage Credits verfügbar." : undefined}
              >
                30 Tage aktivieren
              </button>

              <button
                type="button"
                onClick={() => consume("ACTIVATE_LICENSE_365D")}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                disabled={busy !== null || !has365}
                title={!has365 ? "Keine 365-Tage Credits verfügbar." : undefined}
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
                onClick={() => {
                  void load();
                  void loadPackages();
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                aria-label="Aktualisieren"
                title="Aktualisieren"
                disabled={busy !== null}
              >
                ↻
              </button>
            </div>
          </div>

          {err ? <div className="mt-3 text-sm text-rose-700">{err}</div> : null}
          {traceId ? <div className="mt-1 text-xs text-slate-500">TraceId: {traceId}</div> : null}
        </div>
      </section>

      {/* Credits-Tabelle DIREKT darunter */}
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white">
        <div className="p-5">
          <div className="text-sm font-semibold text-slate-900">Credits</div>
          <div className="mt-1 text-sm text-slate-600">Aktive Credits (FIFO nach Verfall).</div>
        </div>

        <div className="h-px w-full bg-slate-200" />

        <div className="p-5">
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
                    <td className="py-3 font-medium text-slate-900">{creditTypeLabel(c.type)}</td>
                    <td className="py-3 text-right font-semibold text-slate-900">{c.quantity}</td>
                    <td className="py-3 text-right text-slate-700">{fmtDateTime(c.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Pakete kaufen (Kacheln wie vorher) */}
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white">
        <div className="p-5">
          <div className="text-sm font-semibold text-slate-900">Pakete kaufen</div>
          <div className="mt-1 text-sm text-slate-600">One-time purchase. Credits verfallen standardmässig nach 12 Monaten.</div>
        </div>

        <div className="h-px w-full bg-slate-200" />

        <div className="p-5">
          {loadingPkgs ? (
            <div className="text-sm text-slate-600">Lade Pakete…</div>
          ) : pkgs.length === 0 ? (
            <div className="text-sm text-slate-600">Keine Pakete verfügbar.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {pkgs.map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                      {p.description ? <div className="mt-1 text-sm text-slate-600">{p.description}</div> : null}
                    </div>
                    <Badge text="Stripe" tone="muted" />
                  </div>

                  <div className="mt-4 text-sm text-slate-600">
                    <div className="font-medium text-slate-900">Enthält</div>
                    <div className="mt-1">{skuIncludes(p)}</div>
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
        </div>
      </section>

      {/* Gutschein */}
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white">
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

          {err ? <div className="mt-4 text-sm text-rose-700">{err}</div> : null}
          {traceId ? <div className="mt-1 text-xs text-slate-500">TraceId: {traceId}</div> : null}
        </div>
      </section>
    </>
  );
}
