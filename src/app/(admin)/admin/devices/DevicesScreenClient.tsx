"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type DeviceRow = {
  id: string;
  name: string;
  status: "CONNECTED" | "STALE" | "NEVER";
  lastSeenAt: string | null;
  updatedAt: string;
  platform: string | null;
  appVersion: string | null;
  activeEventId: string | null;
};

type DevicesList = { items: DeviceRow[] };

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

function statusChip(s: DeviceRow["status"]) {
  const cls =
    s === "CONNECTED"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : s === "STALE"
        ? "bg-amber-50 text-amber-800 border-amber-100"
        : "bg-slate-50 text-slate-700 border-slate-200";
  const label = s === "CONNECTED" ? "Online" : s === "STALE" ? "Stale" : "Nie";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}

export default function DevicesScreenClient() {
  const [data, setData] = useState<DevicesList | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [showConnect, setShowConnect] = useState(false);

  const [provToken, setProvToken] = useState<{ token: string; expiresAt: string; claimUrl: string } | null>(null);
  const [email, setEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setTraceId(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const url = params.toString() ? `/api/admin/v1/devices?${params.toString()}` : "/api/admin/v1/devices";

      const res = await fetch(url, { cache: "no-store" });
      const json = (await res.json()) as ApiResp<DevicesList>;
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
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  const createToken = useCallback(async () => {
    setBusy("token");
    setErr(null);
    setTraceId(null);
    try {
      const res = await fetch("/api/admin/v1/devices/provision-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as ApiResp<{ token: string; expiresAt: string; claimUrl: string }>;
      if (!json.ok) {
        setErr(json.error.message);
        setTraceId(json.traceId);
        setProvToken(null);
      } else {
        setProvToken(json.data);
      }
    } catch {
      setErr("Netzwerkfehler.");
    } finally {
      setBusy(null);
    }
  }, []);

  const sendEmail = useCallback(async () => {
    const to = email.trim();
    if (!to) return;

    setBusy("email");
    setErr(null);
    setTraceId(null);
    try {
      const res = await fetch("/api/admin/v1/devices/provision-tokens/send-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: to, message: emailMsg.trim() ? emailMsg.trim() : undefined }),
      });
      const json = (await res.json()) as ApiResp<{ sent: true; email: string; expiresAt: string; mode: string }>;
      if (!json.ok) {
        setErr(json.error.message);
        setTraceId(json.traceId);
      } else {
        setEmail("");
        setEmailMsg("");
      }
    } catch {
      setErr("Netzwerkfehler.");
    } finally {
      setBusy(null);
    }
  }, [email, emailMsg]);

  const qrUrl = useMemo(() => {
    if (!provToken) return null;
    const sp = new URLSearchParams();
    sp.set("text", provToken.claimUrl);
    sp.set("size", "320");
    return `/api/platform/v1/qr?${sp.toString()}`;
  }, [provToken]);

  return (
    <div className="space-y-6">
      {/* Toolbar Card */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Suche (Name oder ID)"
              className="h-9 w-72 rounded-xl border border-slate-200 bg-white px-3 text-sm"
            />

            <button
              type="button"
              onClick={load}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              disabled={loading}
            >
              Aktualisieren
            </button>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowConnect(true)}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                Gerät verbinden
              </button>

              <button
                type="button"
                onClick={load}
                className="grid h-9 w-9 place-items-center rounded-xl hover:bg-slate-100 disabled:opacity-50"
                aria-label="Aktualisieren"
                disabled={loading}
              >
                <RefreshIcon className="h-4 w-4 text-slate-600" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Data Card */}
      {loading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm text-slate-600">Lade…</div>
        </section>
      ) : !data ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm text-slate-900">Keine Daten.</div>
          {err ? <div className="mt-2 text-sm text-red-600">{err}</div> : null}
          {traceId ? <div className="mt-1 text-xs text-slate-500">TraceId: {traceId}</div> : null}
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="p-6">
            {data.items.length === 0 ? (
              <div className="text-sm text-slate-600">Noch keine Geräte.</div>
            ) : (
              <table className="w-full table-auto text-sm">
                <thead className="text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="pb-3 text-left">Name</th>
                    <th className="pb-3 text-left">Status</th>
                    <th className="pb-3 text-left">Plattform</th>
                    <th className="pb-3 text-right">Zuletzt gesehen</th>
                    <th className="pb-3 text-right">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="py-3 font-medium text-slate-900">{d.name}</td>
                      <td className="py-3">{statusChip(d.status)}</td>
                      <td className="py-3 text-slate-700">
                        {d.platform ?? "—"}
                        {d.appVersion ? <span className="text-slate-400"> · {d.appVersion}</span> : null}
                      </td>
                      <td className="py-3 text-right">{formatDateTime(d.lastSeenAt)}</td>
                      <td className="py-3 text-right">{formatDateTime(d.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* Connect Modal */}
      {showConnect ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-6">
              <div>
                <div className="text-sm font-semibold text-slate-900">Gerät verbinden</div>
                <div className="text-xs text-slate-600">QR scannen oder Token in der App eingeben.</div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowConnect(false);
                  setProvToken(null);
                }}
                className="rounded-xl px-3 py-2 text-sm font-medium hover:bg-slate-100"
              >
                Schliessen
              </button>
            </div>

            <div className="px-6 py-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 bg-white">
                  <div className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-medium text-slate-900">QR / Token</div>
                      <div className="ml-auto">
                        <button
                          type="button"
                          onClick={createToken}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                          disabled={busy !== null}
                        >
                          Token erzeugen
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="h-px w-full bg-slate-200" />

                  <div className="p-6">
                    {!provToken ? (
                      <div className="text-sm text-slate-600">Noch kein Token erzeugt.</div>
                    ) : (
                      <div className="space-y-3">
                        {qrUrl ? (
                          <Image
                            src={qrUrl}
                            alt="QR"
                            width={160}
                            height={160}
                            className="h-40 w-40 rounded-xl border border-slate-200"
                            unoptimized
                          />
                        ) : null}

                        <div className="text-xs text-slate-600">Gültig bis: {formatDateTime(provToken.expiresAt)}</div>
                        <div className="rounded-xl bg-slate-50 p-3 font-mono text-xs text-slate-800">{provToken.token}</div>
                        <div className="break-all text-xs text-slate-600">{provToken.claimUrl}</div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white">
                  <div className="p-5">
                    <div className="text-sm font-medium text-slate-900">Per E-Mail senden</div>
                    <div className="mt-1 text-sm text-slate-600">Sendet QR/Token + Ablauf.</div>
                  </div>

                  <div className="h-px w-full bg-slate-200" />

                  <div className="p-6">
                    <div className="space-y-2">
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="email@firma.ch"
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                      />
                      <textarea
                        value={emailMsg}
                        onChange={(e) => setEmailMsg(e.target.value)}
                        placeholder="Optionale Nachricht (z. B. für welches Gerät)"
                        className="h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={sendEmail}
                        className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                        disabled={busy !== null || !email.trim()}
                      >
                        E-Mail senden
                      </button>
                    </div>
                  </div>
                </section>
              </div>

              {err ? <div className="mt-4 text-sm text-red-600">{err}</div> : null}
              {traceId ? <div className="mt-1 text-xs text-slate-500">TraceId: {traceId}</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
