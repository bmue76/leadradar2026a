"use client";

import React, { useEffect, useState } from "react";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

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

export default function DeviceUpsertDialog(props: {
  open: boolean;
  mode: "create" | "rename";
  deviceId?: string;
  initialName?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { open, mode, deviceId, initialName, onClose, onDone } = props;

  const [name, setName] = useState(initialName ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName ?? "");
    setErr(null);
    setTraceId(null);
    setBusy(false);
  }, [open, initialName]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Bitte einen Namen eingeben.");
      return;
    }

    setBusy(true);
    setErr(null);
    setTraceId(null);

    try {
      const url = mode === "create" ? "/api/admin/v1/devices" : `/api/admin/v1/devices/${deviceId ?? ""}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      const json = (await res.json()) as ApiResp<{ id: string; name: string }>;

      if (!json.ok) {
        setErr(json.error.message);
        setTraceId(json.traceId);
        setBusy(false);
        return;
      }

      onClose();
      onDone();
    } catch {
      setErr("Netzwerkfehler.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const title = mode === "create" ? "Gerät hinzufügen" : "Gerät umbenennen";
  const subtitle =
    mode === "create"
      ? "Lege ein neues Gerät an (Name kann später geändert werden)."
      : `Ändere den Anzeigenamen. (ID bleibt gleich)`;

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/20" aria-label="Schliessen" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex h-14 items-center justify-between border-b border-slate-200 px-6">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
              <div className="mt-0.5 truncate text-xs text-slate-600">{subtitle}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              Schliessen
            </button>
          </div>

          <div className="space-y-3 px-6 py-5">
            <label className="block text-sm font-medium text-slate-900">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='z. B. "Beat’s iPhone"'
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              autoFocus
            />

            {mode === "rename" && deviceId ? (
              <div className="text-xs text-slate-500">
                Device ID: <span className="font-mono">{deviceId}</span>
              </div>
            ) : null}

            {err ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {err}
                {traceId ? <div className="mt-1 text-xs text-rose-900/70">TraceId: {traceId}</div> : null}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button label="Abbrechen" kind="secondary" onClick={onClose} disabled={busy} />
              <Button label={mode === "create" ? "Anlegen" : "Speichern"} kind="primary" onClick={submit} disabled={busy} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
