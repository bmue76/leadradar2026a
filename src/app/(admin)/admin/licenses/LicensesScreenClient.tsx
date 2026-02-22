"use client";

import React, { useCallback, useEffect, useState } from "react";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type DeviceSummary = {
  id: string;
  name: string;
  status: string;
  lastSeenAt: string | null;
  createdAt: string;
  activeEventId: string | null;
  activeLicense: { type: string; endsAt: string } | null;
};

type HistoryRow = {
  id: string;
  deviceId: string;
  deviceName: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  source: "stripe" | "manual";
  amountCents: number | null;
  currency: string | null;
  note: string | null;
};

type LicensesPayload = { devices: DeviceSummary[]; history: HistoryRow[] };

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function chip(text: string, tone: "ok" | "muted" | "warn") {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800 border-amber-100"
        : "bg-slate-50 text-slate-700 border-slate-200";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{text}</span>;
}

export default function LicensesScreenClient() {
  const [data, setData] = useState<LicensesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setTraceId(null);
    try {
      const res = await fetch("/api/admin/v1/licenses", { cache: "no-store" });
      const json = (await res.json()) as ApiResp<LicensesPayload>;
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

  const devices = data?.devices ?? [];
  const history = data?.history ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Übersicht</div>
            <div className="mt-1 text-xs text-slate-600">Aktiver Status pro Gerät + Historie (newest first).</div>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
            onClick={() => void load()}
          >
            Aktualisieren
          </button>
        </div>

        {err ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {err}
            {traceId ? <div className="mt-1 text-xs text-rose-900/70">TraceId: {traceId}</div> : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="p-5">
          <div className="text-sm font-semibold text-slate-900">Geräte</div>
        </div>
        <div className="h-px w-full bg-slate-200" />
        <div className="p-6 pt-4">
          {loading ? (
            <div className="text-sm text-slate-600">Lade…</div>
          ) : devices.length === 0 ? (
            <div className="text-sm text-slate-600">Keine Geräte.</div>
          ) : (
            <table className="w-full table-auto text-sm">
              <thead className="text-xs font-semibold text-slate-600">
                <tr>
                  <th className="py-2 text-left">Gerät</th>
                  <th className="py-2 text-left">Lizenz</th>
                  <th className="py-2 text-left">Gültig bis</th>
                  <th className="py-2 text-right">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="py-3">
                      <div className="font-semibold text-slate-900">{d.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{d.id}</div>
                    </td>
                    <td className="py-3">
                      {d.activeLicense ? chip(`Aktiv · ${d.activeLicense.type}`, "ok") : chip("Keine aktive Lizenz", "warn")}
                    </td>
                    <td className="py-3 text-slate-700">{d.activeLicense ? formatDateTime(d.activeLicense.endsAt) : "—"}</td>
                    <td className="py-3 text-right text-slate-700">{formatDateTime(d.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Historie</div>
            <div className="text-xs text-slate-500">Newest first</div>
          </div>
        </div>
        <div className="h-px w-full bg-slate-200" />
        <div className="p-6 pt-4">
          {loading ? (
            <div className="text-sm text-slate-600">Lade…</div>
          ) : history.length === 0 ? (
            <div className="text-sm text-slate-600">Noch keine Lizenzen.</div>
          ) : (
            <table className="w-full table-auto text-sm">
              <thead className="text-xs font-semibold text-slate-600">
                <tr>
                  <th className="py-2 text-left">Gerät</th>
                  <th className="py-2 text-left">Typ</th>
                  <th className="py-2 text-left">Von</th>
                  <th className="py-2 text-left">Bis</th>
                  <th className="py-2 text-left">Quelle</th>
                  <th className="py-2 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50">
                    <td className="py-3">
                      <div className="font-semibold text-slate-900">{h.deviceName}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{h.deviceId}</div>
                    </td>
                    <td className="py-3">{chip(h.type, "muted")}</td>
                    <td className="py-3 text-slate-700">{formatDate(h.startsAt)}</td>
                    <td className="py-3 text-slate-700">{formatDate(h.endsAt)}</td>
                    <td className="py-3">{h.source === "stripe" ? chip("Stripe", "ok") : chip("Manual", "muted")}</td>
                    <td className="py-3 text-right text-slate-700">{formatDateTime(h.createdAt)}</td>
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
