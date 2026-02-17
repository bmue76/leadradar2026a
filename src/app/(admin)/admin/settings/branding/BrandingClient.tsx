"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type TenantDto = { id: string; slug: string; name: string; country: string; accentColor: string | null };
type ProfileDto = { legalName: string; displayName: string | null; accentColor: string | null } | null;
type BrandingGetDto = { tenant: TenantDto; profile: ProfileDto };

type UiState =
  | { kind: "idle" }
  | { kind: "loading"; message?: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string; traceId?: string };

type FormState = {
  // legalName bleibt server-required, aber wird auf dieser Seite nicht editiert
  legalName: string;
  displayName: string | null;
  accentColor: string | null;
};

const BRANDING_UPDATED_EVENT = "lr_tenant_branding_updated";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const ACCENT_PRESETS: string[] = [
  "#0F172A",
  "#2563EB",
  "#0EA5E9",
  "#16A34A",
  "#DC2626",
  "#7C3AED",
  "#EA580C",
  "#0D9488",
];

const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);

function isHexColor(s: string | null): s is string {
  if (!s) return false;
  return /^#[0-9A-Fa-f]{6}$/.test(s);
}

function normalizeNull(s: string): string | null {
  const t = s.trim();
  return t.length ? t : null;
}

function normalizeHexLoose(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const withHash = t.startsWith("#") ? t : `#${t}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(withHash)) return withHash.toUpperCase();
  return t;
}

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

function stableStringify(v: unknown): string {
  return JSON.stringify(v);
}

function makeLogoSrc(bust: number) {
  return `/api/admin/v1/tenants/current/logo?ts=${encodeURIComponent(String(bust))}`;
}

async function safeReadJson(res: Response): Promise<unknown> {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) return undefined;
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

function pickTraceIdFromJson(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const t = (payload as Record<string, unknown>)["traceId"];
  return typeof t === "string" && t.trim() ? t.trim() : undefined;
}

function mapDto(dto: BrandingGetDto): FormState {
  const p = dto.profile;
  const legalName = (p?.legalName || dto.tenant.name || "").trim();
  return {
    legalName: legalName.length ? legalName : "LeadRadar",
    displayName: p?.displayName ?? null,
    accentColor: (p?.accentColor ?? dto.tenant.accentColor ?? null) as string | null,
  };
}

function isAllowedLogoFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime && ALLOWED_MIMES.has(mime)) return true;

  // fallback by extension if mime missing
  const name = file.name.toLowerCase();
  if (!mime && (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp") || name.endsWith(".svg"))) return true;

  return false;
}

async function uploadLogo(file: File): Promise<{ ok: true } | { ok: false; message: string; traceId?: string }> {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch("/api/admin/v1/tenants/current/logo", { method: "POST", body: fd, credentials: "same-origin" });
  const payload = await safeReadJson(res);

  if (!res.ok) {
    const traceId = res.headers.get("x-trace-id") ?? pickTraceIdFromJson(payload);
    return { ok: false, message: "Logo Upload fehlgeschlagen.", traceId };
  }

  if (payload && typeof payload === "object" && (payload as any).ok === false) {
    const traceId = res.headers.get("x-trace-id") ?? pickTraceIdFromJson(payload);
    const msg =
      (payload as any).error?.message && typeof (payload as any).error.message === "string"
        ? (payload as any).error.message
        : "Logo Upload fehlgeschlagen.";
    return { ok: false, message: msg, traceId };
  }

  return { ok: true };
}

async function deleteLogo(): Promise<{ ok: true } | { ok: false; message: string; traceId?: string }> {
  const res = await fetch("/api/admin/v1/tenants/current/logo", { method: "DELETE", credentials: "same-origin" });
  const payload = await safeReadJson(res);

  if (!res.ok) {
    const traceId = res.headers.get("x-trace-id") ?? pickTraceIdFromJson(payload);
    return { ok: false, message: "Logo konnte nicht entfernt werden.", traceId };
  }

  if (payload && typeof payload === "object" && (payload as any).ok === false) {
    const traceId = res.headers.get("x-trace-id") ?? pickTraceIdFromJson(payload);
    const msg =
      (payload as any).error?.message && typeof (payload as any).error.message === "string"
        ? (payload as any).error.message
        : "Logo konnte nicht entfernt werden.";
    return { ok: false, message: msg, traceId };
  }

  return { ok: true };
}

export default function BrandingClient() {
  const [ui, setUi] = useState<UiState>({ kind: "idle" });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [initial, setInitial] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState>({ legalName: "", displayName: null, accentColor: null });

  const [toast, setToast] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoLocalPreview, setLogoLocalPreview] = useState<string | null>(null);
  const [logoServerOk, setLogoServerOk] = useState(true);

  const [logoBust, setLogoBust] = useState<number>(0);
  const logoServerSrc = useMemo(() => makeLogoSrc(logoBust), [logoBust]);

  const normalizedHex = useMemo(() => {
    if (form.accentColor && isHexColor(form.accentColor)) return form.accentColor.toUpperCase();
    return null;
  }, [form.accentColor]);

  const dirty = useMemo(() => {
    if (!initial) return false;
    const formDirty = stableStringify(initial) !== stableStringify(form);
    const logoDirty = !!logoFile;
    return formDirty || logoDirty;
  }, [initial, form, logoFile]);

  const canSave = useMemo(() => {
    // legalName ist required in API – bleibt fix aus load()
    return form.legalName.trim().length >= 2 && dirty && !saving;
  }, [form.legalName, dirty, saving]);

  const load = useCallback(async () => {
    setLoading(true);
    setUi({ kind: "idle" });

    try {
      const res = await fetch("/api/admin/v1/branding", { method: "GET", credentials: "same-origin" });
      const json = (await res.json()) as ApiResp<BrandingGetDto>;

      if (!json.ok) {
        setUi({ kind: "error", message: json.error.message || "Fehler beim Laden.", traceId: json.traceId });
        setLoading(false);
        return;
      }

      const mapped = mapDto(json.data);
      setInitial(mapped);
      setForm(mapped);

      setLogoServerOk(true);
      setLogoBust(Date.now());

      setLoading(false);
    } catch {
      setUi({ kind: "error", message: "Netzwerkfehler beim Laden." });
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function reset() {
    if (!initial) return;

    setForm(initial);
    setUi({ kind: "idle" });

    setLogoFile(null);
    if (logoLocalPreview) URL.revokeObjectURL(logoLocalPreview);
    setLogoLocalPreview(null);

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onPickLogo(file: File | null) {
    setUi({ kind: "idle" });

    if (!file) {
      setLogoFile(null);
      if (logoLocalPreview) URL.revokeObjectURL(logoLocalPreview);
      setLogoLocalPreview(null);
      return;
    }

    if (!isAllowedLogoFile(file)) {
      setUi({ kind: "error", message: "Bitte nur PNG, JPG, WebP oder SVG als Logo hochladen." });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      setUi({ kind: "error", message: `Logo ist zu gross (max. ${humanBytes(MAX_LOGO_BYTES)}).` });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setLogoFile(file);
    if (logoLocalPreview) URL.revokeObjectURL(logoLocalPreview);
    setLogoLocalPreview(URL.createObjectURL(file));
  }

  async function onRemoveLogo() {
    if (saving) return;

    const ok = window.confirm("Logo wirklich entfernen?");
    if (!ok) return;

    setSaving(true);
    setUi({ kind: "loading", message: "Logo wird entfernt…" });

    try {
      const del = await deleteLogo();
      if (!del.ok) {
        setUi({ kind: "error", message: del.message, traceId: del.traceId });
        setSaving(false);
        return;
      }

      setLogoFile(null);
      if (logoLocalPreview) URL.revokeObjectURL(logoLocalPreview);
      setLogoLocalPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      setLogoServerOk(true);
      setLogoBust(Date.now());

      window.dispatchEvent(new Event(BRANDING_UPDATED_EVENT));

      setToast("Logo entfernt.");
      window.setTimeout(() => setToast(null), 1600);

      setUi({ kind: "success", message: "Logo entfernt." });
      setSaving(false);
    } catch {
      setUi({ kind: "error", message: "Netzwerkfehler beim Entfernen." });
      setSaving(false);
    }
  }

  async function copyHex() {
    const v = (form.accentColor ?? "").trim();
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
      setToast("HEX kopiert.");
      window.setTimeout(() => setToast(null), 1200);
    } catch {
      // ignore
    }
  }

  async function save() {
    if (!canSave) return;

    setSaving(true);
    setUi({ kind: "loading", message: "Speichert…" });

    try {
      if (logoFile) {
        const up = await uploadLogo(logoFile);
        if (!up.ok) {
          setUi({ kind: "error", message: up.message, traceId: up.traceId });
          setSaving(false);
          return;
        }

        setLogoFile(null);
        if (logoLocalPreview) URL.revokeObjectURL(logoLocalPreview);
        setLogoLocalPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";

        setLogoServerOk(true);
        setLogoBust(Date.now());
      }

      const payload = {
        legalName: form.legalName.trim(),
        displayName: form.displayName,
        accentColor: form.accentColor,
      };

      const res = await fetch("/api/admin/v1/branding", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as ApiResp<{ tenant: TenantDto; profile: ProfileDto }>;

      if (!json.ok) {
        setUi({ kind: "error", message: json.error.message || "Fehler beim Speichern.", traceId: json.traceId });
        setSaving(false);
        return;
      }

      const mapped = mapDto({ tenant: json.data.tenant, profile: json.data.profile });
      setInitial(mapped);
      setForm(mapped);

      window.dispatchEvent(new Event(BRANDING_UPDATED_EVENT));

      setToast("Gespeichert.");
      window.setTimeout(() => setToast(null), 1600);

      setUi({ kind: "success", message: "Gespeichert." });
      setSaving(false);
    } catch {
      setUi({ kind: "error", message: "Netzwerkfehler beim Speichern." });
      setSaving(false);
    }
  }

  return (
    <div className="lr-page space-y-6">
      <header className="lr-pageHeader space-y-2">
        <h1 className="lr-h1">Branding</h1>
        <p className="lr-muted">Logo, Akzentfarbe und Anzeigename – für Wiedererkennung in Admin & App.</p>
      </header>

      {loading ? (
        <div className="lr-panel">
          <div className="h-4 w-40 rounded bg-slate-100" />
          <div className="mt-3 h-10 w-full rounded bg-slate-100" />
          <div className="mt-3 h-10 w-full rounded bg-slate-100" />
        </div>
      ) : ui.kind === "error" ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <div className="text-sm font-semibold text-rose-900">Fehler</div>
          <div className="mt-1 text-sm text-rose-800">{ui.message}</div>
          {ui.traceId ? (
            <div className="mt-2 text-xs text-rose-700">
              TraceId: <span className="font-mono">{ui.traceId}</span>
            </div>
          ) : null}

          <div className="lr-actions">
            <button className="lr-btnSecondary" type="button" onClick={() => void load()}>
              Erneut versuchen
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="lr-panel">
            <div className="lr-panelHeader">
              <div>
                <div className="lr-h2">Branding</div>
                <div className="lr-muted mt-1">Akzentfarbe wird sparsam für Highlights genutzt (Tabs, Fokus, kleine Marker).</div>
              </div>
            </div>

            <div className="mt-5 grid gap-6 md:grid-cols-2">
              {/* Logo */}
              <div className="space-y-3">
                <div className="text-sm font-medium text-slate-800">Logo</div>

                <div className="flex items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex h-[88px] w-full max-w-[340px] items-center justify-center">
                    {logoLocalPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoLocalPreview} alt="Logo Vorschau" className="h-full w-auto object-contain" />
                    ) : logoServerOk ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoServerSrc}
                        alt="Tenant Logo"
                        className="h-full w-auto object-contain"
                        onError={() => setLogoServerOk(false)}
                      />
                    ) : (
                      <div className="text-xs text-slate-500">Kein Logo gesetzt</div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-xl file:border file:border-slate-200 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-50"
                    onChange={(e) => onPickLogo(e.target.files?.[0] ?? null)}
                  />

                  <div className="flex flex-wrap gap-2">
                    <button className="lr-btnSecondary" type="button" onClick={onRemoveLogo} disabled={saving}>
                      Logo entfernen
                    </button>
                    <button
                      className="lr-btnSecondary"
                      type="button"
                      onClick={() => {
                        setLogoServerOk(true);
                        setLogoBust(Date.now());
                      }}
                    >
                      Vorschau aktualisieren
                    </button>
                  </div>

                  <p className="text-xs text-slate-500">Empfohlen: transparentes PNG oder sauberes SVG. Max. {humanBytes(MAX_LOGO_BYTES)}.</p>
                </div>
              </div>

              {/* Name + Accent */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-800">Anzeigename (optional)</div>
                  <input
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={form.displayName ?? ""}
                    placeholder={form.legalName}
                    onChange={(e) => setField("displayName", normalizeNull(e.target.value))}
                    onBlur={(e) => setField("displayName", normalizeNull(e.target.value))}
                  />
                  <div className="text-xs text-slate-500">
                    Wird in Admin & App als Name angezeigt. Wenn leer, wird der offizielle Firmenname verwendet.
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-medium text-slate-800">Akzentfarbe</div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      {ACCENT_PRESETS.map((hex) => {
                        const active = normalizedHex === hex.toUpperCase();
                        return (
                          <button
                            key={hex}
                            type="button"
                            className={[
                              "h-9 w-9 rounded-xl border transition",
                              active ? "border-slate-900 ring-2 ring-slate-300" : "border-slate-200 hover:border-slate-300",
                            ].join(" ")}
                            style={{ backgroundColor: hex }}
                            onClick={() => setField("accentColor", hex.toUpperCase())}
                            aria-label={`Preset ${hex}`}
                            title={hex}
                          />
                        );
                      })}

                      <button
                        type="button"
                        className={[
                          "h-9 rounded-xl border px-3 text-xs font-semibold transition",
                          !normalizedHex ? "border-slate-900 bg-white" : "border-slate-200 bg-white hover:border-slate-300",
                        ].join(" ")}
                        onClick={() => setField("accentColor", null)}
                        title="Akzent entfernen"
                      >
                        Neutral
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={normalizedHex ?? "#000000"}
                          className="h-10 w-12 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
                          onChange={(e) => setField("accentColor", e.target.value.toUpperCase())}
                          aria-label="Color Picker"
                          title="Color Picker"
                        />
                        <div
                          className="h-10 w-10 rounded-xl border border-slate-200"
                          style={{ backgroundColor: normalizedHex ?? "transparent" }}
                          title={normalizedHex ?? "—"}
                        />
                      </div>

                      <input
                        className="h-10 min-w-[170px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        value={form.accentColor ?? ""}
                        placeholder="#RRGGBB"
                        onChange={(e) => setField("accentColor", normalizeNull(e.target.value))}
                        onBlur={(e) => setField("accentColor", normalizeHexLoose(e.target.value))}
                      />

                      <button className="lr-btnSecondary" type="button" onClick={() => setField("accentColor", null)}>
                        Entfernen
                      </button>

                      <button className="lr-btnSecondary" type="button" onClick={() => void copyHex()} disabled={!form.accentColor}>
                        HEX kopieren
                      </button>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs font-semibold text-slate-700">Preview</div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl border border-slate-200 bg-white flex items-center justify-center">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--lr-accent)" }} />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {((form.displayName ?? "") || form.legalName || "LeadRadar").trim()}
                          </div>
                          <div className="text-xs text-slate-600">Akzent wird dezent als Marker/Fokus genutzt.</div>
                        </div>
                      </div>
                    </div>

                    {ui.kind === "loading" ? <div className="lr-muted mt-3">{ui.message || "Bitte warten…"}</div> : null}
                    {ui.kind === "success" ? <div className="mt-3 text-sm text-slate-700">{ui.message}</div> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">{dirty ? "Ungespeicherte Änderungen." : "Keine Änderungen."}</div>

            <div className="flex items-center gap-2">
              {dirty ? (
                <button className="lr-btnSecondary" onClick={reset} disabled={saving} type="button">
                  Änderungen verwerfen
                </button>
              ) : null}

              <button className="lr-btn" onClick={() => void save()} disabled={!canSave} type="button">
                {saving ? "Speichert…" : "Speichern"}
              </button>
            </div>
          </div>
        </>
      )}

      {toast ? (
        <div className="fixed bottom-5 right-5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
