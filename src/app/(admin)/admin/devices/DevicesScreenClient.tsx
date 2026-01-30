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
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusChip(s: DeviceRow["status"]) {
  const cls =
    s === "CONNECTED"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : s === "STALE"
        ? "bg-amber-50 text-amber-800 border-amber-100"
        : "bg-slate-50 text-slate-700 border-slate-200";
  const label = s === "CONNECTED" ? "Online" : s === "STALE" ? "Stale" : "Nie";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

function Button({
  label,
  kind,
  onClick,
  disabled,
}: {
  label: string;
  kind: "primary" | "secondary";
  onClick: () => void;
  disabled?: boolean;
}) {
  const base =
    "inline-flex h-9 items-center justify-center rounded-xl px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200";
  const cls =
    kind === "primary"
      ? `${base} bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50`
      : `${base} border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 disabled:opacity-50`;

  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

function IconButton({ title, onClick, disabled }: { title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
      aria-label={title}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      ↻
    </button>
  );
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
      setData(null);
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
      setProvToken(null);
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
      {/* List Card */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        {/* Toolbar */}
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Suchen…"
              className="h-9 w-[260px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />

            <IconButton title="Aktualisieren" onClick={load} disabled={loading} />

            <div className="ml-auto flex items-center gap-2">
              <Button label="Gerät verbinden" kind="primary" onClick={() => setShowConnect(true)} />
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-slate-200" />

        {/* Content */}
        <div className="p-6 pt-4">
          {loading ? (
            <div className="text-sm text-slate-600">Lade…</div>
          ) : !data ? (
            <div>
              <div className="text-sm font-semibold text-slate-900">Keine Daten.</div>
              {err ? <div className="mt-2 text-sm text-rose-700">{err}</div> : null}
              {traceId ? <div className="mt-1 text-xs text-slate-500">TraceId: {traceId}</div> : null}
            </div>
          ) : data.items.length === 0 ? (
            <div className="py-4 text-sm text-slate-600">Noch keine Geräte.</div>
          ) : (
            <table className="w-full table-auto text-sm">
              <thead className="text-xs font-semibold text-slate-600">
                <tr>
                  <th className="py-2 text-left">Name</th>
                  <th className="py-2 text-left">Status</th>
                  <th className="py-2 text-left">Plattform</th>
                  <th className="py-2 text-right">Zuletzt gesehen</th>
                  <th className="py-2 text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="py-3 font-semibold text-slate-900">{d.name}</td>
                    <td className="py-3">{statusChip(d.status)}</td>
                    <td className="py-3 text-slate-700">
                      {d.platform ?? "—"}
                      {d.appVersion ? <span className="text-slate-400"> · {d.appVersion}</span> : null}
                    </td>
                    <td className="py-3 text-right text-slate-700">{formatDateTime(d.lastSeenAt)}</td>
                    <td className="py-3 text-right text-slate-700">{formatDateTime(d.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Connect Modal */}
      {showConnect ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/20"
            aria-label="Schliessen"
            onClick={() => {
              setShowConnect(false);
              setProvToken(null);
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex h-14 items-center justify-between border-b border-slate-200 px-6">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">Gerät verbinden</div>
                  <div className="mt-0.5 text-xs text-slate-600">QR scannen oder Token in der App eingeben.</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowConnect(false);
                    setProvToken(null);
                  }}
                  className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  Schliessen
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 px-6 py-6 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">QR / Token</div>
                    <Button label="Token erzeugen" kind="secondary" onClick={createToken} disabled={busy !== null} />
                  </div>

                  {!provToken ? (
                    <div className="mt-3 text-sm text-slate-600">Noch kein Token erzeugt.</div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {qrUrl ? (
                        <div className="inline-block rounded-xl border border-slate-200 bg-white p-2">
                          <Image src={qrUrl} alt="QR" width={160} height={160} className="h-40 w-40" unoptimized />
                        </div>
                      ) : null}

                      <div className="text-xs text-slate-600">Gültig bis: {formatDateTime(provToken.expiresAt)}</div>
                      <div className="rounded-xl bg-slate-50 p-2 font-mono text-xs text-slate-900">{provToken.token}</div>
                      <div className="break-all text-xs text-slate-600">{provToken.claimUrl}</div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-900">Per E-Mail senden</div>
                  <div className="mt-1 text-sm text-slate-600">Sendet QR/Token + Ablauf.</div>

                  <div className="mt-3 space-y-2">
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@firma.ch"
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                    <textarea
                      value={emailMsg}
                      onChange={(e) => setEmailMsg(e.target.value)}
                      placeholder="Optionale Nachricht (z. B. für welches Gerät)"
                      className="h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                    <Button label="E-Mail senden" kind="primary" onClick={sendEmail} disabled={busy !== null || !email.trim()} />
                  </div>
                </div>
              </div>

              {(err || traceId) ? (
                <div className="border-t border-slate-200 px-6 py-4">
                  {err ? <div className="text-sm text-rose-700">{err}</div> : null}
                  {traceId ? <div className="mt-1 text-xs text-slate-500">TraceId: {traceId}</div> : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
