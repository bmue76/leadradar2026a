"use client";

import * as React from "react";

type UiState =
  | { kind: "idle"; message?: string }
  | { kind: "loading"; message?: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
]);

function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

async function safeReadJson(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return undefined;
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

export default function BrandingClient() {
  const [state, setState] = React.useState<UiState>({ kind: "idle" });
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  const refreshLogo = React.useCallback(async () => {
    try {
      const head = await fetch("/api/admin/v1/tenants/current/logo?v=0", {
        method: "HEAD",
        cache: "no-store",
      });

      if (head.ok) {
        setLogoUrl(`/api/admin/v1/tenants/current/logo?v=${encodeURIComponent(new Date().toISOString())}`);
      } else {
        setLogoUrl(null);
      }
    } catch {
      setLogoUrl(null);
    }
  }, []);

  React.useEffect(() => {
    void refreshLogo();
  }, [refreshLogo]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_MIMES.has(file.type)) {
      setState({
        kind: "error",
        message: "Ungültiger Dateityp. Erlaubt: PNG, JPG, SVG.",
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    if (file.size > MAX_BYTES) {
      setState({
        kind: "error",
        message: `Datei zu gross. Maximal ${humanBytes(MAX_BYTES)}.`,
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setState({ kind: "loading", message: "Upload läuft…" });

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch("/api/admin/v1/tenants/current/logo", {
      method: "POST",
      body: fd,
    });

    const payload = await safeReadJson(res);

    if (!res.ok) {
      setState({
        kind: "error",
        message:
          typeof payload === "object" && payload !== null
            ? "Upload fehlgeschlagen."
            : "Upload fehlgeschlagen.",
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setState({ kind: "success", message: "Logo gespeichert." });
    if (fileRef.current) fileRef.current.value = "";
    await refreshLogo();
  }

  async function onRemove() {
    setState({ kind: "loading", message: "Logo wird entfernt…" });

    const res = await fetch("/api/admin/v1/tenants/current/logo", {
      method: "DELETE",
    });

    if (!res.ok) {
      setState({ kind: "error", message: "Entfernen fehlgeschlagen." });
      return;
    }

    setState({ kind: "success", message: "Logo entfernt." });
    await refreshLogo();
  }

  return (
    <div className="lr-panel">
      <h2 className="lr-h2">Tenant Logo</h2>
      <p className="lr-muted">
        Erlaubt: PNG/JPG/SVG, max. {humanBytes(MAX_BYTES)}. Rendering ohne Cropping/Stretching
        (contain).
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14 }}>
        <div
          style={{
            width: 220,
            height: 64,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.08)",
            background: "rgba(0,0,0,0.02)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Tenant Logo"
              style={{ maxHeight: 44, width: "auto", objectFit: "contain" }}
            />
          ) : (
            <span className="lr-muted">Kein Logo</span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            ref={fileRef}
            type="file"
            accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
            onChange={onUpload}
          />

          <div className="lr-actions" style={{ gap: 10 }}>
            <button
              className="lr-btn"
              type="button"
              onClick={onRemove}
              disabled={!logoUrl || state.kind === "loading"}
            >
              Entfernen
            </button>
          </div>

          {state.kind === "loading" ? (
            <div className="lr-muted">{state.message || "Bitte warten…"}</div>
          ) : null}
          {state.kind === "success" ? (
            <div style={{ color: "rgba(0,0,0,0.75)" }}>{state.message}</div>
          ) : null}
          {state.kind === "error" ? (
            <div style={{ color: "rgba(180,0,0,0.85)" }}>{state.message}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
