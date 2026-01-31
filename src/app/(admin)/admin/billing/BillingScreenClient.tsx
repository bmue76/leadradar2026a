"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type CreditType = "LICENSE_30D" | "LICENSE_365D" | "DEVICE_SLOT";

type BillingOverview = {
  entitlement: {
    validUntil: string | null;
    isActive: boolean;
    maxDevices: number;
    activeDevices: number;
  };
  credits: Array<{ type: CreditType; quantity: number; expiresAt: string }>;
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

function creditLabel(t: CreditType): string {
  if (t === "LICENSE_30D") return "Lizenz 30 Tage";
  if (t === "LICENSE_365D") return "Lizenz 365 Tage";
  return "Geräte-Slot";
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

function skuKindBadges(s: BillingSku): Array<{ text: string; tone: "muted" | "ok" }> {
  const out: Array<{ text: string; tone: "muted" | "ok" }> = [];

  const isSingle = (s.grantLicense30d === 1 && s.grantLicense365d === 0 && s.grantDeviceSlots === 0) ||
    (s.grantLicense30d === 0 && s.grantLicense365d === 1 && s.grantDeviceSlots === 0);

  const isTier10 = (s.grantLicense30d === 10 || s.grantLicense365d === 10) && s.grantDeviceSlots === 0;

  if (isSingle) out.push({ text: "Einzellizenz", tone: "muted" });
  if (isTier10) out.push({ text: "Staffelpreis", tone: "ok" });

  out.push({ text: "Stripe", tone: "muted" });
  return out;
}

function savingsText(s: BillingSku): string | null {
  if (s.amountCents == null) return null;

  const base30 = 3900;
  const base365 = 39900;

  if (s.grantLicense30d === 10) {
    const normal = base30 * 10;
    const diff = normal - s.amountCents;
    if (diff > 0) return `Spare ${fmtMoney(s.currency, diff)} gegenüber 10× Einzellizenz.`;
  }

  if (s.grantLicense365d === 10) {
    const normal = base365 * 10;
    const diff = normal - s.amountCents;
    if (diff > 0) return `Spare ${fmtMoney(s.currency, diff)} gegenüber 10× Einzellizenz.`;
  }

  return null;
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

  const meta = useMemo(() => {
    if (!data) return null;

    const byType: Record<CreditType, number> = { LICENSE_30D: 0, LICENSE_365D: 0, DEVICE_SLOT: 0 };
    for (const c of data.credits) byType[c.type] = (byType[c.type] ?? 0) + c.quantity;

    const chips: Array<{ label: string; qty: number }> = [
      { label: "30 Tage", qty: byType.LICENSE_30D },
      { label: "365 Tage", qty: byType.LICENSE_365D },
      { label: "Geräte", qty: byType.DEVICE_SLOT },
    ];

    return {
      activeText: data.entitlement.isActive ? "Aktiv" : "Inaktiv",
      creditChips: chips.filter((x) => x.qty > 0),
    };
  }, [data]);

  const pkgsSorted = useMemo(() => {
    return (pkgs ?? [])
      .filter((p) => p.active)
      .slice()
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name, "de-CH");
      });
  }, [pkgs]);

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
        setPkgs(json.data.items ?? []);
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
    <div className="space-y-4">
      {banner ? <Banner tone={banner.tone} title={banner.title} text={banner.text} /> : null}

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

            {meta?.creditChips?.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-600">Verfügbare Credits:</span>
                {meta.creditChips.map((c) => (
                  <span
                    key={c.label}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700"
                  >
                    <span>{c.label}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-slate-900">{c.qty}</span>
                  </span>
                ))}
              </div>
            ) : null}
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
              onClick={() => {
                void load();
                void loadPackages();
              }}
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
          <div className="mt-3 text-sm text-amber-800">Hinweis: {data.expiringSoon.count} Credit-Balance(s) läuft/laufen bald ab.</div>
        ) : null}

        {err ? <div className="mt-3 text-sm text-rose-700">{err}</div> : null}
        {traceId ? <div className="mt-1 text-xs text-slate-500">TraceId: {traceId}</div> : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="p-5">
          <div className="text-sm font-semibold text-slate-900">Pakete kaufen</div>
          <div className="mt-1 text-sm text-slate-600">One-time purchase. Credits verfallen standardmässig nach 12 Monaten.</div>
        </div>

        <div className="h-px w-full bg-slate-200" />

        <div className="p-6 pt-5">
          {loadingPkgs ? (
            <div className="text-sm text-slate-600">Lade Pakete…</div>
          ) : pkgsSorted.length === 0 ? (
            <div className="text-sm text-slate-600">Keine Pakete verfügbar.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {pkgsSorted.map((p) => {
                const badges = skuKindBadges(p);
                const save = savingsText(p);

                return (
                  <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                        {p.description ? <div className="mt-1 text-sm text-slate-600">{p.description}</div> : null}
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {badges.map((b) => (
                          <Badge key={b.text} text={b.text} tone={b.tone === "ok" ? "ok" : "muted"} />
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 text-sm text-slate-600">
                      <div className="font-medium text-slate-900">Enthält</div>
                      <div className="mt-1">{skuIncludes(p)}</div>
                      <div className="mt-2 text-xs text-slate-500">Verfall: {p.creditExpiresInDays} Tage</div>
                      {save ? <div className="mt-2 text-xs font-semibold text-emerald-800">{save}</div> : null}
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
                );
              })}
            </div>
          )}

          {err ? <div className="mt-4 text-sm text-rose-700">{err}</div> : null}
          {traceId ? <div className="mt-1 text-xs text-slate-500">TraceId: {traceId}</div> : null}
        </div>
      </section>

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
                    <td className="py-3 font-medium text-slate-900">{creditLabel(c.type)}</td>
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
