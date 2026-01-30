"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useState } from "react";

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

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("de-CH", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusChip(s: DeviceRow["status"]) {
  const cls =
    s === "CONNECTED"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : s === "STALE"
        ? "bg-amber-50 text-amber-800 border-amber-100"
        : "bg-zinc-50 text-zinc-700 border-zinc-100";
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
      const url = new URL("/api/admin/v1/devices", window.location.origin);
      if (q.trim()) url.searchParams.set("q", q.trim());
      const res = await fetch(url.toString(), { cache: "no-store" });
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
    const u = new URL("/api/platform/v1/qr", window.location.origin);
    u.searchParams.set("text", provToken.claimUrl);
    u.searchParams.set("size", "320");
    return u.toString();
  }, [provToken]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Geräte</h1>
          <p className="mt-1 text-sm text-zinc-600">Verbundene Geräte, Status, Event-Bind und Provisioning.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowConnect(true)}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800"
        >
          Gerät verbinden
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Suche (Name)"
          className="w-72 rounded-md border border-zinc-200 px-3 py-2 text-sm"
        />
        <button type="button" onClick={load} className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50">
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
        <div className="rounded-xl border border-zinc-200 bg-white">
          <div className="px-6 py-2">
            {data.items.length === 0 ? (
              <div className="py-4 text-sm text-zinc-600">Noch keine Geräte.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="py-2 text-left font-medium">Name</th>
                    <th className="py-2 text-left font-medium">Status</th>
                    <th className="py-2 text-left font-medium">Plattform</th>
                    <th className="py-2 text-right font-medium">Zuletzt gesehen</th>
                    <th className="py-2 text-right font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((d) => (
                    <tr key={d.id} className="border-t border-zinc-50">
                      <td className="py-2 font-medium">{d.name}</td>
                      <td className="py-2">{statusChip(d.status)}</td>
                      <td className="py-2 text-zinc-700">
                        {d.platform ?? "—"}{d.appVersion ? <span className="text-zinc-400"> · {d.appVersion}</span> : null}
                      </td>
                      <td className="py-2 text-right">{formatDateTime(d.lastSeenAt)}</td>
                      <td className="py-2 text-right">{formatDateTime(d.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {showConnect ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold">Gerät verbinden</div>
                <div className="mt-1 text-sm text-zinc-600">QR scannen oder Token in der App eingeben.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowConnect(false);
                  setProvToken(null);
                }}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
              >
                Schliessen
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">QR / Token</div>
                  <button
                    type="button"
                    onClick={createToken}
                    className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
                    disabled={busy !== null}
                  >
                    Token erzeugen
                  </button>
                </div>

                {!provToken ? (
                  <div className="mt-3 text-sm text-zinc-600">Noch kein Token erzeugt.</div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {qrUrl ? (
                      <div className="h-40 w-40 overflow-hidden rounded-lg border border-zinc-200">
                        <Image src={qrUrl} alt="QR" width={160} height={160} className="h-40 w-40 object-contain" />
                      </div>
                    ) : null}
                    <div className="text-xs text-zinc-600">Gültig bis: {formatDateTime(provToken.expiresAt)}</div>
                    <div className="rounded-lg bg-zinc-50 p-2 font-mono text-xs">{provToken.token}</div>
                    <div className="text-xs text-zinc-600 break-all">{provToken.claimUrl}</div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-zinc-200 p-4">
                <div className="text-sm font-medium">Per E-Mail senden</div>
                <div className="mt-1 text-sm text-zinc-600">Sendet QR/Token + Ablauf.</div>
                <div className="mt-3 space-y-2">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@firma.ch"
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <textarea
                    value={emailMsg}
                    onChange={(e) => setEmailMsg(e.target.value)}
                    placeholder="Optionale Nachricht (z. B. für welches Gerät)"
                    className="h-24 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={sendEmail}
                    className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
                    disabled={busy !== null || !email.trim()}
                  >
                    E-Mail senden
                  </button>
                </div>
              </div>
            </div>

            {err ? <div className="mt-4 text-sm text-red-600">{err}</div> : null}
            {traceId ? <div className="mt-1 text-xs text-zinc-500">TraceId: {traceId}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
