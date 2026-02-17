"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type TenantDto = { id: string; slug: string; name: string; country: string; accentColor: string | null };
type ProfileDto = {
  tenantId: string;

  legalName: string;
  displayName: string | null;

  accentColor: string | null;

  createdAt: string;
  updatedAt: string;
};

type BrandingGetDto = { tenant: TenantDto; profile: ProfileDto | null };

type FormState = {
  // required by API (hidden in UI)
  legalName: string;

  // shown
  displayName: string | null;
  accentColor: string | null;
};

type RGB = { r: number; g: number; b: number };
type CMYK = { c: number; m: number; y: number; k: number };

const BRANDING_UPDATED_EVENT = "lr_tenant_branding_updated";

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

const ACCENT_PRESETS: string[] = [
  "#0F172A", // slate-900 (neutral)
  "#2563EB", // blue-600
  "#0EA5E9", // sky-500
  "#16A34A", // green-600
  "#DC2626", // red-600
  "#7C3AED", // violet-600
  "#EA580C", // orange-600
  "#0D9488", // teal-600
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v : null;
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

function normalizeNull(s: string): string | null {
  const t = s.trim();
  return t.length ? t : null;
}

function isHexColor(s: string | null): s is string {
  if (!s) return false;
  return /^#[0-9A-Fa-f]{6}$/.test(s);
}

function normalizeHexLoose(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const withHash = t.startsWith("#") ? t : `#${t}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(withHash)) return withHash.toUpperCase();
  return t; // keep as-is (server will validate)
}

function clampInt(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampFloat(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): RGB | null {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHex(rgb: RGB): string {
  const r = clampInt(rgb.r, 0, 255).toString(16).padStart(2, "0");
  const g = clampInt(rgb.g, 0, 255).toString(16).padStart(2, "0");
  const b = clampInt(rgb.b, 0, 255).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`.toUpperCase();
}

function rgbToCmyk(rgb: RGB): CMYK {
  const r = clampInt(rgb.r, 0, 255) / 255;
  const g = clampInt(rgb.g, 0, 255) / 255;
  const b = clampInt(rgb.b, 0, 255) / 255;

  const k = 1 - Math.max(r, g, b);
  if (k >= 0.999999) return { c: 0, m: 0, y: 0, k: 100 };

  const c = ((1 - r - k) / (1 - k)) * 100;
  const m = ((1 - g - k) / (1 - k)) * 100;
  const y = ((1 - b - k) / (1 - k)) * 100;

  return {
    c: clampInt(c, 0, 100),
    m: clampInt(m, 0, 100),
    y: clampInt(y, 0, 100),
    k: clampInt(k * 100, 0, 100),
  };
}

function cmykToRgb(cmyk: CMYK): RGB {
  const c = clampFloat(cmyk.c, 0, 100) / 100;
  const m = clampFloat(cmyk.m, 0, 100) / 100;
  const y = clampFloat(cmyk.y, 0, 100) / 100;
  const k = clampFloat(cmyk.k, 0, 100) / 100;

  const r = 255 * (1 - c) * (1 - k);
  const g = 255 * (1 - m) * (1 - k);
  const b = 255 * (1 - y) * (1 - k);

  return { r: clampInt(r, 0, 255), g: clampInt(g, 0, 255), b: clampInt(b, 0, 255) };
}

function stableStringify(v: unknown): string {
  return JSON.stringify(v);
}

function makeLogoSrc(bust: number) {
  return `/api/admin/v1/tenants/current/logo?ts=${bust}`;
}

function mapDtoToForm(dto: BrandingGetDto): FormState {
  const p = dto.profile;
  if (!p) {
    return {
      legalName: dto.tenant.name || "",
      displayName: null,
      accentColor: dto.tenant.accentColor ?? null,
    };
  }

  return {
    legalName: p.legalName,
    displayName: p.displayName,
    accentColor: p.accentColor,
  };
}

async function uploadLogo(file: File): Promise<{ ok: true } | { ok: false; message: string; traceId?: string }> {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch("/api/admin/v1/tenants/current/logo", {
    method: "POST",
    body: fd,
    credentials: "same-origin",
  });

  const payload = await safeReadJson(res);

  if (!res.ok) {
    const traceId = res.headers.get("x-trace-id") ?? (isRecord(payload) ? pickString(payload.traceId) ?? undefined : undefined);
    const msg =
      isRecord(payload) && payload.ok === false && isRecord(payload.error) && typeof payload.error.message === "string"
        ? payload.error.message
        : "Logo Upload fehlgeschlagen.";
    return { ok: false, message: msg, traceId };
  }

  // ok response shape is not needed here
  return { ok: true };
}

async function deleteLogo(): Promise<{ ok: true } | { ok: false; message: string; traceId?: string }> {
  const res = await fetch("/api/admin/v1/tenants/current/logo", {
    method: "DELETE",
    credentials: "same-origin",
  });

  const payload = await safeReadJson(res);

  if (!res.ok) {
    const traceId = res.headers.get("x-trace-id") ?? (isRecord(payload) ? pickString(payload.traceId) ?? undefined : undefined);
    const msg =
      isRecord(payload) && payload.ok === false && isRecord(payload.error) && typeof payload.error.message === "string"
        ? payload.error.message
        : "Logo konnte nicht entfernt werden.";
    return { ok: false, message: msg, traceId };
  }

  return { ok: true };
}

export default function BrandingClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tenant, setTenant] = useState<TenantDto | null>(null);

  const [initial, setInitial] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState>({
    legalName: "",
    displayName: null,
    accentColor: null,
  });

  const [loadError, setLoadError] = useState<{ message: string; traceId?: string } | null>(null);
  const [inlineError, setInlineError] = useState<{ message: string; traceId?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoLocalPreview, setLogoLocalPreview] = useState<string | null>(null);
  const [logoServerOk, setLogoServerOk] = useState<boolean>(true);

  // IMPORTANT: no Date.now() in initial state (avoid SSR hydration mismatch)
  const [logoBust, setLogoBust] = useState<number>(0);
  const logoServerSrc = useMemo(() => makeLogoSrc(logoBust), [logoBust]);

  const normalizedHex = useMemo(() => {
    if (form.accentColor && isHexColor(form.accentColor)) return form.accentColor.toUpperCase();
    return null;
  }, [form.accentColor]);

  const rgb = useMemo(() => {
    const base = normalizedHex ?? "#000000";
    return hexToRgb(base) ?? { r: 0, g: 0, b: 0 };
  }, [normalizedHex]);

  const cmyk = useMemo(() => rgbToCmyk(rgb), [rgb]);

  const dirty = useMemo(() => {
    if (!initial) return false;
    const formDirty = stableStringify(initial) !== stableStringify(form);
    const logoDirty = !!logoFile;
    return formDirty || logoDirty;
  }, [initial, form, logoFile]);

  const canSave = useMemo(() => {
    // legalName is hidden but required; we enforce >=2 anyway
    return form.legalName.trim().length >= 2 && dirty && !saving;
  }, [form.legalName, dirty, saving]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setInlineError(null);

    try {
      const res = await fetch("/api/admin/v1/branding", { method: "GET", credentials: "same-origin" });
      const json = (await safeReadJson(res)) as ApiResp<BrandingGetDto> | undefined;

      if (!res.ok || !json || json.ok !== true) {
        const traceId = res.headers.get("x-trace-id") ?? (json && isRecord(json) ? pickString(json.traceId) ?? undefined : undefined);
        const msg =
          json && isRecord(json) && json.ok === false && isRecord(json.error) && typeof json.error.message === "string"
            ? json.error.message
            : "Fehler beim Laden.";
        setLoadError({ message: msg, traceId });
        setLoading(false);
        return;
      }

      setTenant(json.data.tenant);

      const mapped = mapDtoToForm(json.data);
      setInitial(mapped);
      setForm(mapped);

      setLogoServerOk(true);
      setLogoBust(Date.now());

      setLoading(false);
    } catch {
      setLoadError({ message: "Netzwerkfehler beim Laden.", traceId: undefined });
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
    setInlineError(null);

    setLogoFile(null);
    if (logoLocalPreview) URL.revokeObjectURL(logoLocalPreview);
    setLogoLocalPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onPickLogo(file: File | null) {
    setInlineError(null);

    if (!file) {
      setLogoFile(null);
      if (logoLocalPreview) URL.revokeObjectURL(logoLocalPreview);
      setLogoLocalPreview(null);
      return;
    }

    const mime = (file.type || "").toLowerCase();
    if (mime && !ALLOWED_MIMES.has(mime)) {
      setInlineError({ message: "Bitte nur PNG, JPG, WebP oder SVG als Logo hochladen.", traceId: undefined });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      setInlineError({ message: "Logo ist zu gross (max. 2 MB).", traceId: undefined });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setLogoFile(file);
    if (logoLocalPreview) URL.revokeObjectURL(logoLocalPreview);
    setLogoLocalPreview(URL.createObjectURL(file));
  }

  async function onRemoveLogo() {
    if (saving) return;
    setInlineError(null);

    const ok = window.confirm("Logo wirklich entfernen?");
    if (!ok) return;

    setSaving(true);

    try {
      const del = await deleteLogo();
      if (!del.ok) {
        setInlineError({ message: del.message, traceId: del.traceId });
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
      window.setTimeout(() => setToast(null), 1800);

      setSaving(false);
    } catch {
      setInlineError({ message: "Netzwerkfehler beim Entfernen.", traceId: undefined });
      setSaving(false);
    }
  }

  function setFromRgb(next: Partial<RGB>) {
    const merged: RGB = { r: next.r ?? rgb.r, g: next.g ?? rgb.g, b: next.b ?? rgb.b };
    setField("accentColor", rgbToHex(merged));
  }

  function setFromCmyk(next: Partial<CMYK>) {
    const merged: CMYK = { c: next.c ?? cmyk.c, m: next.m ?? cmyk.m, y: next.y ?? cmyk.y, k: next.k ?? cmyk.k };
    const nextRgb = cmykToRgb(merged);
    setField("accentColor", rgbToHex(nextRgb));
  }

  async function copyHex() {
    const v = (form.accentColor ?? "").trim();
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
      setToast("HEX kopiert.");
      window.setTimeout(() => setToast(null), 1400);
    } catch {
      // ignore
    }
  }

  async function save() {
    if (!canSave) return;

    setSaving(true);
    setInlineError(null);

    try {
      if (logoFile) {
        const up = await uploadLogo(logoFile);
        if (!up.ok) {
          setInlineError({ message: up.message, traceId: up.traceId });
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

      // IMPORTANT: Always send displayName explicitly to avoid clobbering Tenant.name logic in API.
      const payload = {
        legalName: form.legalName.trim(),
        displayName: form.displayName,
        accentColor: form.accentColor,
      };

      const res = await fetch("/api/admin/v1/branding", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });

      const json = (await safeReadJson(res)) as ApiResp<{ tenant: TenantDto; profile: ProfileDto | null }> | undefined;

      if (!res.ok || !json || json.ok !== true) {
        const traceId = res.headers.get("x-trace-id") ?? (json && isRecord(json) ? pickString(json.traceId) ?? undefined : undefined);
        const msg =
          json && isRecord(json) && json.ok === false && isRecord(json.error) && typeof json.error.message === "string"
            ? json.error.message
            : "Fehler beim Speichern.";
        setInlineError({ message: msg, traceId });
        setSaving(false);
        return;
      }

      setTenant(json.data.tenant);

      const mapped: FormState = mapDtoToForm({ tenant: json.data.tenant, profile: json.data.profile });
      setInitial(mapped);
      setForm(mapped);

      window.dispatchEvent(new Event(BRANDING_UPDATED_EVENT));

      setToast("Gespeichert.");
      window.setTimeout(() => setToast(null), 1800);

      setSaving(false);
    } catch {
      setInlineError({ message: "Netzwerkfehler beim Speichern.", traceId: undefined });
      setSaving(false);
    }
  }

  const previewName = useMemo(() => {
    const dn = (form.displayName ?? "").trim();
    if (dn) return dn;
    const ln = (form.legalName ?? "").trim();
    if (ln) return ln;
    const tn = (tenant?.name ?? "").trim();
    return tn || "LeadRadar";
  }, [form.displayName, form.legalName, tenant?.name]);

  return (
    <div className="space-y-6">
      <header className="lr-pageHeader space-y-2">
        <h1 className="lr-h1">Branding</h1>
        <p className="lr-muted">Logo, Anzeigename und Akzentfarbe – für Wiedererkennung in App &amp; Admin.</p>
      </header>

      {loading ? (
        <section className="lr-panel">
          <div className="h-4 w-40 rounded bg-slate-100" />
          <div className="mt-3 h-10 w-full rounded bg-slate-100" />
          <div className="mt-3 h-10 w-full rounded bg-slate-100" />
        </section>
      ) : loadError ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <h2 className="text-base font-semibold text-rose-900">Konnte Branding nicht laden</h2>
          <p className="mt-1 text-sm text-rose-800">{loadError.message}</p>
          {loadError.traceId ? (
            <p className="mt-2 text-xs text-rose-700">
              TraceId: <span className="font-mono">{loadError.traceId}</span>
            </p>
          ) : null}
          <div className="mt-4">
            <button
              className="lr-btnSecondary"
              type="button"
              onClick={() => void load()}
            >
              Erneut versuchen
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* Branding Panel */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="lr-h2">Branding</h2>
                <p className="lr-muted mt-1">Logo (PNG/JPG/WebP/SVG) und Akzentfarbe – wird in App &amp; Admin verwendet.</p>
              </div>

              {/* small live preview */}
              <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 md:flex">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: normalizedHex ?? "var(--lr-accent)" }} />
                <span className="text-sm font-semibold text-slate-900">{previewName}</span>
              </div>
            </div>

            <div className="mt-5 grid gap-6 md:grid-cols-2">
              {/* Logo */}
              <div className="space-y-3">
                <div className="text-sm font-medium text-slate-800">Logo Vorschau</div>

                <div className="flex items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex h-[88px] w-full max-w-[320px] items-center justify-center">
                    {logoLocalPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoLocalPreview} alt="Logo Preview" className="h-full w-auto object-contain" />
                    ) : logoServerOk ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoServerSrc}
                        alt=""
                        className="h-full w-auto object-contain"
                        onError={() => setLogoServerOk(false)}
                      />
                    ) : (
                      <div className="text-xs text-slate-500">Kein Logo gesetzt</div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-800">Logo ändern</div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-xl file:border file:border-slate-200 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-50"
                    onChange={(e) => onPickLogo(e.target.files?.[0] ?? null)}
                  />

                  <div className="flex flex-wrap items-center gap-2">
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
                      disabled={saving}
                    >
                      Vorschau aktualisieren
                    </button>
                  </div>

                  <p className="text-xs text-slate-500">Empfohlen: transparentes PNG. Max. 2 MB.</p>
                </div>
              </div>

              {/* Name + Color */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-800">Anzeigename</div>
                  <input
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    value={form.displayName ?? ""}
                    placeholder={form.legalName || tenant?.name || "Firmenname"}
                    onChange={(e) => setField("displayName", normalizeNull(e.target.value))}
                  />
                  <p className="text-xs text-slate-500">Optional. Wenn leer, wird der offizielle Firmenname verwendet.</p>
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-medium text-slate-800">Akzentfarbe</div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    {/* Presets */}
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      {ACCENT_PRESETS.map((hex) => {
                        const active = normalizedHex === hex.toUpperCase();
                        return (
                          <button
                            key={hex}
                            type="button"
                            className={[
                              "h-9 w-9 rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-slate-300",
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
                          "h-9 rounded-xl border px-3 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-slate-300",
                          !normalizedHex ? "border-slate-900 bg-white" : "border-slate-200 bg-white hover:border-slate-300",
                        ].join(" ")}
                        onClick={() => setField("accentColor", null)}
                        title="Akzent entfernen"
                      >
                        Neutral
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {/* Color Picker */}
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

                      {/* HEX */}
                      <div className="min-w-[170px] flex-1">
                        <input
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                          value={form.accentColor ?? ""}
                          placeholder="#RRGGBB"
                          onChange={(e) => setField("accentColor", normalizeNull(e.target.value))}
                          onBlur={(e) => setField("accentColor", normalizeHexLoose(e.target.value))}
                        />
                      </div>

                      <button className="lr-btnSecondary" type="button" onClick={() => setField("accentColor", null)}>
                        Entfernen
                      </button>

                      <button className="lr-btnSecondary" type="button" onClick={() => void copyHex()} disabled={!form.accentColor}>
                        HEX kopieren
                      </button>
                    </div>

                    {/* RGB */}
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-slate-600">RGB — R</div>
                        <input
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                          type="number"
                          min={0}
                          max={255}
                          value={rgb.r}
                          onChange={(e) => setFromRgb({ r: clampInt(Number(e.target.value), 0, 255) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-slate-600">RGB — G</div>
                        <input
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                          type="number"
                          min={0}
                          max={255}
                          value={rgb.g}
                          onChange={(e) => setFromRgb({ g: clampInt(Number(e.target.value), 0, 255) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-slate-600">RGB — B</div>
                        <input
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                          type="number"
                          min={0}
                          max={255}
                          value={rgb.b}
                          onChange={(e) => setFromRgb({ b: clampInt(Number(e.target.value), 0, 255) })}
                        />
                      </div>
                    </div>

                    {/* CMYK */}
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-slate-600">CMYK — C</div>
                        <input
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                          type="number"
                          min={0}
                          max={100}
                          value={cmyk.c}
                          onChange={(e) => setFromCmyk({ c: clampInt(Number(e.target.value), 0, 100) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-slate-600">CMYK — M</div>
                        <input
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                          type="number"
                          min={0}
                          max={100}
                          value={cmyk.m}
                          onChange={(e) => setFromCmyk({ m: clampInt(Number(e.target.value), 0, 100) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-slate-600">CMYK — Y</div>
                        <input
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                          type="number"
                          min={0}
                          max={100}
                          value={cmyk.y}
                          onChange={(e) => setFromCmyk({ y: clampInt(Number(e.target.value), 0, 100) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-slate-600">CMYK — K</div>
                        <input
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                          type="number"
                          min={0}
                          max={100}
                          value={cmyk.k}
                          onChange={(e) => setFromCmyk({ k: clampInt(Number(e.target.value), 0, 100) })}
                        />
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-slate-500">
                      Tipp: Preset oder Color Picker nutzen. HEX/RGB/CMYK sind synchronisiert.
                    </p>

                    {inlineError ? (
                      <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                        {inlineError.message}
                        {inlineError.traceId ? (
                          <span className="ml-2 text-xs text-rose-700">
                            TraceId: <span className="font-mono">{inlineError.traceId}</span>
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Actions */}
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
