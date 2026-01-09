"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

type ApiResult<T> =
  | { ok: true; data: T; traceId: string }
  | { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };

const LS_DEMO_CAPTURE_KEY_LEGACY = "lr_demo_capture_mobile_api_key";
const LS_DEMO_CAPTURE_KEY_DEV = "leadradar.devMobileApiKey";

function setDemoCaptureKey(token: string) {
  try {
    const t = token.trim();
    if (!t) return;
    window.localStorage.setItem(LS_DEMO_CAPTURE_KEY_DEV, t);
    window.localStorage.setItem(LS_DEMO_CAPTURE_KEY_LEGACY, t);
  } catch {
    // ignore
  }
}

function friendlyMessage(code: string): string {
  switch (code) {
    case "INVALID_PROVISION_TOKEN":
      return "Token ist ungültig. Bitte prüfen oder im Admin neu erstellen.";
    case "PROVISION_TOKEN_EXPIRED":
      return "Token ist abgelaufen. Bitte im Admin einen neuen Token erstellen.";
    case "PROVISION_TOKEN_USED":
      return "Token wurde bereits verwendet. Bitte einen neuen Token erstellen.";
    case "PROVISION_TOKEN_REVOKED":
      return "Token wurde widerrufen. Bitte im Admin einen neuen Token erstellen.";
    case "RATE_LIMITED":
      return "Zu viele Versuche. Bitte kurz warten und erneut versuchen.";
    default:
      return "Konnte Token nicht claimen. Bitte erneut versuchen.";
  }
}

export default function ProvisionClient() {
  const sp = useSearchParams();
  const tokenFromUrl = (sp.get("token") || "").trim();

  const [token, setToken] = React.useState(tokenFromUrl);
  const [deviceName, setDeviceName] = React.useState("Messe Device");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; traceId?: string } | null>(null);

  React.useEffect(() => {
    if (tokenFromUrl && !token) setToken(tokenFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromUrl]);

  async function claim() {
    const t = token.trim();
    if (!t) {
      setError({ message: "Bitte Token eingeben." });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/mobile/v1/provision/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: t, deviceName: deviceName.trim() || undefined }),
      });

      const json = (await res.json()) as ApiResult<{
        token: string;
        device: { id: string; name: string; status: string };
        apiKey: { id: string; prefix: string; status: string };
        assignedFormIds: string[];
      }>;

      if (!json.ok) {
        setError({ message: friendlyMessage(json.error.code), traceId: json.traceId });
        return;
      }

      setDemoCaptureKey(json.data.token);
      window.location.href = "/admin/demo/capture";
    } catch (e: unknown) {
      setError({ message: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Demo Provision (DEV)</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Claimt einen Provision Token und speichert den erhaltenen <span className="font-mono">x-api-key</span> in{" "}
        <span className="font-mono">localStorage</span> (Demo Capture).
      </p>

      {error ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div>{error.message}</div>
          {error.traceId ? <div className="mt-1 text-xs text-amber-900/70">Trace-ID: <span className="font-mono">{error.traceId}</span></div> : null}
        </div>
      ) : null}

      <div className="mt-6">
        <label className="mb-1 block text-xs font-medium text-neutral-700">Provision token</label>
        <input
          className="w-full rounded-xl border border-neutral-200 px-3 py-2 font-mono text-xs"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="prov_..."
          disabled={loading}
        />
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-neutral-700">Device name (optional)</label>
        <input
          className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder="z.B. iPad Eingang"
          disabled={loading}
        />
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
        <a
          href="/admin/demo/capture"
          className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
        >
          Open Demo Capture
        </a>
        <button
          type="button"
          onClick={() => void claim()}
          className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Claiming…" : "Claim token"}
        </button>
      </div>
    </div>
  );
}
