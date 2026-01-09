"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fmtErr(e: { code: string; message: string; traceId?: string; status?: number }): string {
  const parts = [`${e.code}: ${e.message}`];
  if (typeof e.status === "number") parts.push(`HTTP ${e.status}`);
  if (e.traceId) parts.push(`trace ${e.traceId}`);
  return parts.join(" · ");
}

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

export default function ProvisionDemoClient() {
  const sp = useSearchParams();
  const tokenFromUrl = (sp.get("token") ?? "").trim();

  const [token, setToken] = React.useState(tokenFromUrl);
  const [deviceName, setDeviceName] = React.useState("Demo iPad");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [claimed, setClaimed] = React.useState<{
    apiKeyPrefix?: string;
    deviceId?: string;
    deviceName?: string;
    assignedCount?: number;
  } | null>(null);

  React.useEffect(() => {
    if (tokenFromUrl && !token) setToken(tokenFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromUrl]);

  async function onClaim() {
    const t = token.trim();
    if (!t) return;

    setSubmitting(true);
    setError(null);
    setClaimed(null);

    try {
      const res = await fetch("/api/mobile/v1/provision/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: t, deviceName: deviceName.trim() || undefined }),
      });

      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      const traceId = res.headers.get("x-trace-id") || (isRecord(payload) ? (payload.traceId as string | undefined) : undefined);

      if (!res.ok) {
        const code =
          isRecord(payload) && isRecord(payload.error) && typeof payload.error.code === "string"
            ? (payload.error.code as string)
            : "REQUEST_FAILED";
        const message =
          isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
            ? (payload.error.message as string)
            : "Request failed.";
        setError(fmtErr({ code, message, traceId, status: res.status }));
        return;
      }

      if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) {
        setError(fmtErr({ code: "BAD_RESPONSE", message: "Unexpected response shape.", traceId, status: res.status }));
        return;
      }

      const data = payload.data as Record<string, unknown>;

      const apiKeyToken =
        typeof data.token === "string"
          ? (data.token as string)
          : isRecord(data.apiKey) && typeof (data.apiKey as Record<string, unknown>).token === "string"
          ? ((data.apiKey as Record<string, unknown>).token as string)
          : null;

      const apiKeyPrefix =
        isRecord(data.apiKey) && typeof (data.apiKey as Record<string, unknown>).prefix === "string"
          ? ((data.apiKey as Record<string, unknown>).prefix as string)
          : undefined;

      const deviceId =
        isRecord(data.device) && typeof (data.device as Record<string, unknown>).id === "string"
          ? ((data.device as Record<string, unknown>).id as string)
          : undefined;

      const devName =
        isRecord(data.device) && typeof (data.device as Record<string, unknown>).name === "string"
          ? ((data.device as Record<string, unknown>).name as string)
          : undefined;

      const assignedFormIds = Array.isArray(data.assignedFormIds) ? data.assignedFormIds : [];
      const assignedCount = assignedFormIds.filter((x) => typeof x === "string").length;

      if (!apiKeyToken) {
        setError(fmtErr({ code: "MISSING_API_KEY", message: "Claim succeeded, but no api key returned.", traceId }));
        return;
      }

      setDemoCaptureKey(apiKeyToken);

      setClaimed({ apiKeyPrefix, deviceId, deviceName: devName, assignedCount });

      // Go to demo capture
      window.location.href = "/admin/demo/capture";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Demo Provision (DEV-only)</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Claim a provisioning token → store x-api-key in localStorage → redirect to Demo Capture.
      </p>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {claimed ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Claimed. Redirecting…{" "}
          <div className="mt-2 text-xs text-emerald-900/70">
            Device: <span className="font-mono">{claimed.deviceName ?? "—"}</span> · Prefix:{" "}
            <span className="font-mono">{claimed.apiKeyPrefix ?? "—"}</span> · Assigned:{" "}
            <span className="font-mono">{String(claimed.assignedCount ?? 0)}</span>
          </div>
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5">
        <label className="mb-1 block text-xs font-medium text-neutral-700">Provision Token</label>
        <textarea
          className="mb-4 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm font-mono"
          rows={3}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="prov_... token"
          disabled={submitting}
        />

        <label className="mb-1 block text-xs font-medium text-neutral-700">Device name (optional)</label>
        <input
          className="mb-4 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder="Demo iPad"
          disabled={submitting}
        />

        <div className="flex items-center justify-end gap-2">
          <a
            href="/admin/settings/mobile"
            className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
          >
            Back
          </a>
          <button
            type="button"
            onClick={() => void onClaim()}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
            disabled={submitting || !token.trim()}
          >
            {submitting ? "Claiming…" : "Claim token"}
          </button>
        </div>

        <div className="mt-3 text-xs text-neutral-600">
          Writes to localStorage: <span className="font-mono">leadradar.devMobileApiKey</span>
        </div>
      </div>
    </div>
  );
}
