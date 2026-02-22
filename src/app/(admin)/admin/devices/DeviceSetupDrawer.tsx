"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type ProvisionCreateResp = {
  token: string;
  expiresAt: string;
  qrPayload: string;
  tenantSlug: string;
  deviceId: string;
};

type ProvisionStatusResp = {
  activeToken: { status: "ACTIVE" | "REVOKED" | "USED"; createdAt: string; expiresAt: string } | null;
};

type LicenseSummary = {
  active: null | { type: "FAIR_30D" | "YEAR_365D"; endsAt: string };
  pendingCount: number;
  pendingNextType: "FAIR_30D" | "YEAR_365D" | null;
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function DrawerButton({
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

function licenseBadge(lic: LicenseSummary) {
  if (lic.active) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        Aktiv · {lic.active.type}
      </span>
    );
  }
  if (lic.pendingCount > 0) {
    const t = lic.pendingNextType ? ` · ${lic.pendingNextType}` : "";
    const c = lic.pendingCount > 1 ? ` (${lic.pendingCount})` : "";
    return (
      <span className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
        Gekauft · wartet auf Aktivierung{t}{c}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
      Keine Lizenz
    </span>
  );
}

export default function DeviceSetupDrawer({
  open,
  deviceId,
  deviceName,
  license,
  onClose,
  onChanged,
}: {
  open: boolean;
  deviceId: string;
  deviceName: string;
  license: LicenseSummary;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);

  const [token, setToken] = useState<ProvisionCreateResp | null>(null);
  const [status, setStatus] = useState<ProvisionStatusResp | null>(null);

  const [email, setEmail] = useState("");
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const onChangedRef = useRef<(() => void) | undefined>(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const qrUrl = useMemo(() => {
    if (!token) return null;
    const u = new URL("/api/platform/v1/qr", window.location.origin);
    u.searchParams.set("text", token.qrPayload);
    u.searchParams.set("size", "360");
    return u.toString();
  }, [token]);

  const loadStatus = useCallback(async () => {
    setErr(null);
    setTraceId(null);
    try {
      const res = await fetch(`/api/admin/v1/devices/${deviceId}/provisioning`, { cache: "no-store" });
      const json = (await res.json()) as ApiResp<ProvisionStatusResp>;
      if (!json.ok) {
        setErr(json.error.message);
        setTraceId(json.traceId);
        setStatus(null);
      } else {
        setStatus(json.data);
      }
    } catch {
      setErr("Netzwerkfehler.");
      setStatus(null);
    }
  }, [deviceId]);

  const createOrReturn = useCallback(async () => {
    setBusy("create");
    setErr(null);
    setTraceId(null);
    try {
      const res = await fetch(`/api/admin/v1/devices/${deviceId}/provisioning`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as ApiResp<ProvisionCreateResp>;
      if (!json.ok) {
        setErr(json.error.message);
        setTraceId(json.traceId);
        setToken(null);
      } else {
        setToken(json.data);
        await loadStatus();
        onChangedRef.current?.();
      }
    } catch {
      setErr("Netzwerkfehler.");
      setToken(null);
    } finally {
      setBusy(null);
    }
  }, [deviceId, loadStatus]);

  const rotate = useCallback(async () => {
    setBusy("rotate");
    setErr(null);
    setTraceId(null);
    try {
      const res = await fetch(`/api/admin/v1/devices/${deviceId}/provisioning/rotate`, { method: "POST" });
      const json = (await res.json()) as ApiResp<ProvisionCreateResp>;
      if (!json.ok) {
        setErr(json.error.message);
        setTraceId(json.traceId);
      } else {
        setToken(json.data);
        await loadStatus();
        onChangedRef.current?.();
      }
    } catch {
      setErr("Netzwerkfehler.");
    } finally {
      setBusy(null);
    }
  }, [deviceId, loadStatus]);

  const resend = useCallback(async () => {
    const to = email.trim();
    if (!to) return;

    setBusy("email");
    setErr(null);
    setTraceId(null);
    setEmailNotice(null);

    try {
      const res = await fetch(`/api/admin/v1/devices/${deviceId}/provisioning/resend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: to }),
      });

      const json = (await res.json()) as ApiResp<{ sent: true; mode: string; smtp?: { configured: boolean; missing: string[] } }>;
      if (!json.ok) {
        setErr(json.error.message);
        setTraceId(json.traceId);
      } else {
        setEmail("");
        if (json.data.mode === "SMTP") {
          setEmailNotice("E-Mail wurde versendet.");
        } else {
          const missing = json.data.smtp?.missing?.length ? ` (fehlend: ${json.data.smtp.missing.join(", ")})` : "";
          setEmailNotice(`Nur geloggt – SMTP nicht aktiv${missing}.`);
        }
      }
    } catch {
      setErr("Netzwerkfehler.");
    } finally {
      setBusy(null);
    }
  }, [deviceId, email]);

  const copyToken = useCallback(async () => {
    if (!token?.token) return;
    try {
      await navigator.clipboard.writeText(token.token);
      setEmailNotice("Token kopiert.");
      window.setTimeout(() => setEmailNotice(null), 2500);
    } catch {
      setEmailNotice("Copy fehlgeschlagen.");
      window.setTimeout(() => setEmailNotice(null), 2500);
    }
  }, [token]);

  useEffect(() => {
    if (!open) return;

    setToken(null);
    setStatus(null);
    setErr(null);
    setTraceId(null);
    setEmail("");
    setEmailNotice(null);

    void (async () => {
      await loadStatus();
      await createOrReturn();
    })();
  }, [open, deviceId, loadStatus, createOrReturn]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-5">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">Gerät einrichten</div>
            <div className="mt-0.5 truncate text-xs text-slate-600">{deviceName}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            Schliessen
          </button>
        </div>

        <div className="space-y-4 p-5 pb-10">
          {err ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {err}
              {traceId ? <div className="mt-1 text-xs text-rose-900/70">TraceId: {traceId}</div> : null}
            </div>
          ) : null}

          {/* License (clear!) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Lizenz</div>
              {licenseBadge(license)}
            </div>
            <div className="mt-2 text-sm text-slate-700">
              {license.active ? (
                <>Aktiv bis {formatDateTime(license.active.endsAt)}.</>
              ) : license.pendingCount > 0 ? (
                <>Lizenz ist gekauft, startet erst bei App-Aktivierung.</>
              ) : (
                <>Keine Lizenz vorhanden.</>
              )}
            </div>
          </div>

          {/* Provisioning Code Meta */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">Provisioning-Code</div>
              <DrawerButton label="Refresh" kind="secondary" onClick={() => void loadStatus()} disabled={busy !== null} />
            </div>

            <div className="mt-2 text-sm text-slate-700">
              {status?.activeToken ? (
                <>
                  <div>
                    Code gültig bis <span className="font-semibold">{formatDateTime(status.activeToken.expiresAt)}</span>.
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Erstellt: {formatDateTime(status.activeToken.createdAt)}</div>
                </>
              ) : (
                <div className="text-slate-600">Kein aktiver Code (bereits verwendet oder abgelaufen).</div>
              )}
            </div>
          </div>

          {/* QR + Token */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">QR / Token</div>

            {!token ? (
              <div className="mt-3 text-sm text-slate-600">Lade Token…</div>
            ) : (
              <div className="mt-3 space-y-3">
                {qrUrl ? (
                  <div className="inline-block rounded-xl border border-slate-200 bg-white p-2">
                    <Image src={qrUrl} alt="QR" width={200} height={200} className="h-44 w-44" unoptimized />
                  </div>
                ) : null}

                <div className="text-xs text-slate-600">Gültig bis: {formatDateTime(token.expiresAt)}</div>

                <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-2">
                  <div className="font-mono text-sm font-semibold text-slate-900">{token.token}</div>
                  <DrawerButton label="Copy" kind="secondary" onClick={() => void copyToken()} disabled={busy !== null} />
                </div>

                <div className="break-all text-xs text-slate-600">{token.qrPayload}</div>
              </div>
            )}
          </div>

          {/* Email */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Per E-Mail senden</div>
            <div className="mt-2 flex gap-2">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@firma.ch"
                className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <DrawerButton label="Senden" kind="primary" onClick={() => void resend()} disabled={busy !== null || !email.trim()} />
            </div>

            {emailNotice ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
                {emailNotice}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <DrawerButton label="Erneut senden (gleich)" kind="secondary" onClick={() => void createOrReturn()} disabled={busy !== null} />
            <DrawerButton label="Neuen Code erzeugen" kind="secondary" onClick={() => void rotate()} disabled={busy !== null} />
          </div>
        </div>
      </div>
    </div>
  );
}
