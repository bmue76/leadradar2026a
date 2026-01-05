"use client";

import * as React from "react";
import { TenantLogo } from "../../_components/TenantLogo";
import styles from "./branding.module.css";

const LS_KEY = "lr_branding_logo_version_v1";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function readTenantRef(): string | null {
  const v = (document.documentElement.dataset.lrTenantSlug ?? "").trim();
  return v || null;
}

async function safeJson(res: Response): Promise<any | null> {
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!ct.includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function BrandingClient() {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [tenantRef, setTenantRef] = React.useState<string | null>(null);

  React.useEffect(() => {
    const update = () => setTenantRef(readTenantRef());
    update();

    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-lr-tenant-slug"],
    });

    return () => obs.disconnect();
  }, []);

  const notifyLogoChanged = (logoUpdatedAtIso: string) => {
    window.localStorage.setItem(LS_KEY, logoUpdatedAtIso);
    window.dispatchEvent(new Event("lr:branding"));
  };

  const onPick = () => {
    setMsg(null);
    inputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED.has(file.type)) {
      setMsg("Ungültiger Dateityp. Erlaubt: PNG, JPG, WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setMsg(`Datei zu gross (${fmtBytes(file.size)}). Maximal ${fmtBytes(MAX_BYTES)}.`);
      return;
    }

    const ref = readTenantRef();
    if (!ref) {
      setMsg("TenantRef fehlt (data-lr-tenant-slug). Bitte Seite neu laden.");
      return;
    }

    setBusy(true);
    setMsg(null);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/admin/v1/tenants/current/logo", {
        method: "POST",
        headers: { "x-tenant-slug": ref },
        body: fd,
        credentials: "same-origin",
      });

      const j = await safeJson(res);

      if (!res.ok) {
        const m = j?.error?.message ?? `Upload fehlgeschlagen (HTTP ${res.status}).`;
        setMsg(`${m} (tenantRef: ${ref})`);
        return;
      }

      const updatedAt = j?.data?.branding?.logoUpdatedAt ?? new Date().toISOString();
      notifyLogoChanged(updatedAt);
      setMsg("Logo hochgeladen.");
    } catch {
      setMsg("Upload fehlgeschlagen (Netzwerk/Server).");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    const ref = readTenantRef();
    if (!ref) {
      setMsg("TenantRef fehlt (data-lr-tenant-slug). Bitte Seite neu laden.");
      return;
    }

    setBusy(true);
    setMsg(null);

    try {
      const res = await fetch("/api/admin/v1/tenants/current/logo", {
        method: "DELETE",
        headers: { "x-tenant-slug": ref },
        credentials: "same-origin",
      });

      const j = await safeJson(res);

      if (!res.ok) {
        const m = j?.error?.message ?? `Entfernen fehlgeschlagen (HTTP ${res.status}).`;
        setMsg(`${m} (tenantRef: ${ref})`);
        return;
      }

      const updatedAt = j?.data?.branding?.logoUpdatedAt ?? new Date().toISOString();
      notifyLogoChanged(updatedAt);
      setMsg("Logo entfernt.");
    } catch {
      setMsg("Entfernen fehlgeschlagen (Netzwerk/Server).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.h1}>Branding</h1>
        <p className={styles.p}>
          Das Logo wird <strong>nicht</strong> verändert. Keine Optimierung, kein Cropping,
          kein Stretching — nur Anzeige mit <code>max-height</code>, <code>width:auto</code>,
          <code>object-fit:contain</code>.
        </p>
        <p className={styles.pTiny}>
          TenantRef: <code>{tenantRef ?? "—"}</code>
        </p>
      </div>

      <div className={styles.row}>
        <div className={styles.preview}>
          <div className={styles.label}>Vorschau</div>
          <TenantLogo variant="settings" />
          <div className={styles.hint}>
            Erlaubt: PNG/JPG/WebP · Max {fmtBytes(MAX_BYTES)}
          </div>
        </div>

        <div className={styles.actions}>
          <div className={styles.label}>Aktionen</div>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className={styles.file}
            onChange={onFileChange}
          />

          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onPick}
            disabled={busy}
          >
            Logo hochladen
          </button>

          <button
            type="button"
            className={styles.btnGhost}
            onClick={onRemove}
            disabled={busy}
          >
            Entfernen
          </button>

          {msg ? <div className={styles.msg}>{msg}</div> : null}
        </div>
      </div>
    </div>
  );
}
