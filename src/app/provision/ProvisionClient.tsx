"use client";

import Image from "next/image";
import React, { useMemo, useState } from "react";

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
    "inline-flex h-10 items-center justify-center rounded-2xl px-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200";
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

export default function ProvisionClient({ tenant, code }: { tenant: string; code: string }) {
  const [notice, setNotice] = useState<string | null>(null);

  const deepLink = useMemo(() => {
    if (!tenant || !code) return "";
    return `leadradar://provision?tenant=${encodeURIComponent(tenant)}&code=${encodeURIComponent(code)}`;
  }, [tenant, code]);

  const qrUrl = useMemo(() => {
    if (!deepLink) return "";
    const u = new URL("/api/platform/v1/qr", window.location.origin);
    u.searchParams.set("text", deepLink);
    u.searchParams.set("size", "420");
    return u.toString();
  }, [deepLink]);

  async function copyToken() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setNotice("Token kopiert.");
      window.setTimeout(() => setNotice(null), 2500);
    } catch {
      setNotice("Copy fehlgeschlagen – bitte Token manuell markieren und kopieren.");
      window.setTimeout(() => setNotice(null), 3500);
    }
  }

  async function copyDeepLink() {
    if (!deepLink) return;
    try {
      await navigator.clipboard.writeText(deepLink);
      setNotice("Deep Link kopiert.");
      window.setTimeout(() => setNotice(null), 2500);
    } catch {
      setNotice("Copy fehlgeschlagen – bitte Link manuell kopieren.");
      window.setTimeout(() => setNotice(null), 3500);
    }
  }

  return (
    <div className="min-h-[calc(100vh-2rem)] bg-slate-50 p-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6">
          <div className="text-xs font-semibold tracking-wide text-slate-500">LEADRADAR</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Gerät verbinden</h1>
          <p className="mt-1 text-sm text-slate-600">Token kopieren oder QR scannen.</p>
        </div>

        {notice ? (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {notice}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">Token</div>

            {tenant && code ? (
              <>
                <div className="mt-3 rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-500">Tenant</div>
                  <div className="mt-1 font-mono text-sm text-slate-900">{tenant}</div>

                  <div className="mt-4 text-xs font-semibold text-slate-500">Code</div>
                  <div className="mt-1 font-mono text-xl font-extrabold tracking-widest text-slate-900">{code}</div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button label="Token kopieren" kind="primary" onClick={() => void copyToken()} />
                  <Button label="Deep Link kopieren" kind="secondary" onClick={() => void copyDeepLink()} />
                </div>

                <div className="mt-3 text-xs text-slate-500">
                  Tipp: Auf dem Smartphone kannst du auch einfach den QR-Code scannen.
                </div>
              </>
            ) : (
              <div className="mt-3 text-sm text-slate-600">Fehlende Parameter. Bitte Link aus der E-Mail verwenden.</div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-900">QR Code</div>

            {qrUrl ? (
              <div className="mt-3">
                <div className="inline-block rounded-2xl border border-slate-200 bg-white p-3">
                  <Image src={qrUrl} alt="QR" width={260} height={260} className="h-64 w-64" unoptimized />
                </div>

                <div className="mt-3 break-all text-xs text-slate-600">{deepLink}</div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-slate-600">Noch kein QR verfügbar.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
