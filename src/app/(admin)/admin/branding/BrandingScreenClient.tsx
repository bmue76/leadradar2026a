"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
} from "react";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type TenantDto = { id: string; slug: string; name: string; country: string; accentColor: string | null };
type ProfileDto = {
  tenantId: string;

  legalName: string;
  displayName: string | null;

  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;

  vatId: string | null;

  contactGivenName: string | null;
  contactFamilyName: string | null;
  contactEmail: string | null;

  accentColor: string | null;

  createdAt: string;
  updatedAt: string;
};

type BrandingGetDto = { tenant: TenantDto; profile: ProfileDto | null };

type FormState = {
  legalName: string;
  displayName: string | null;

  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;

  vatId: string | null;

  contactGivenName: string | null;
  contactFamilyName: string | null;
  contactEmail: string | null;

  accentColor: string | null;
};

type RGB = { r: number; g: number; b: number };
type CMYK = { c: number; m: number; y: number; k: number };

const BRANDING_UPDATED_EVENT = "lr_tenant_branding_updated";

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

function normalizeNull(s: string): string | null {
  const t = s.trim();
  return t.length ? t : null;
}

function normalizeHexLoose(s: string): string | null {
  const t = s.trim();
  if (!t) return null;

  const withHash = t.startsWith("#") ? t : `#${t}`;
  if (/^#[0-9A-Fa-f]{6}$/.test(withHash)) return withHash.toUpperCase();
  return t; // keep as-is (will be validated server-side)
}

function isHexColor(s: string | null): boolean {
  if (!s) return false;
  return /^#[0-9A-Fa-f]{6}$/.test(s);
}

function stableStringify(v: unknown): string {
  return JSON.stringify(v);
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

function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "soft" },
) {
  const { variant = "secondary", className = "", ...rest } = props;

  const base =
    "lr-focusRing inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";

  const cls =
    variant === "primary"
      ? "bg-slate-900 text-white hover:bg-slate-800"
      : variant === "ghost"
        ? "bg-transparent text-slate-700 hover:bg-slate-100"
        : variant === "soft"
          ? "lr-btnSoft"
          : "bg-white text-slate-800 border border-slate-200 hover:bg-slate-50";

  return <button className={`${base} ${cls} ${className}`} {...rest} />;
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`lr-input lr-focusRing ${className}`} {...rest} />;
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-medium text-slate-800">{children}</div>;
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ErrorState({
  title,
  message,
  traceId,
  onRetry,
}: {
  title: string;
  message: string;
  traceId?: string;
  onRetry: () => void;
}) {
  async function copyTrace() {
    if (!traceId) return;
    try {
      await navigator.clipboard.writeText(traceId);
    } catch {
      // ignore
    }
  }

  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
      <h2 className="text-base font-semibold text-rose-900">{title}</h2>
      <p className="mt-1 text-sm text-rose-800">{message}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={onRetry} variant="secondary" type="button">
          Erneut versuchen
        </Button>
        {traceId ? (
          <>
            <span className="text-xs text-rose-700">
              TraceId: <span className="font-mono">{traceId}</span>
            </span>
            <Button onClick={copyTrace} variant="ghost" type="button">
              TraceId kopieren
            </Button>
          </>
        ) : null}
      </div>
    </section>
  );
}

function Toast({ text }: { text: string }) {
  return (
    <div className="fixed bottom-5 right-5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm">
      {text}
    </div>
  );
}

function makeLogoSrc(bust: number) {
  return `/api/admin/v1/tenants/current/logo?ts=${bust}`;
}

function isAllowedLogoFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime === "image/png") return true;
  if (mime === "image/jpeg") return true;
  if (mime === "image/webp") return true;
  if (mime === "image/svg+xml") return true;

  // fallback by extension if mime missing
  const name = file.name.toLowerCase();
  if (!mime && (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp") || name.endsWith(".svg"))) return true;

  return false;
}

async function uploadLogo(file: File): Promise<{ ok: true } | { ok: false; message: string; traceId?: string }> {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch("/api/admin/v1/tenants/current/logo", { method: "POST", body: fd });
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  if (ct.includes("application/json")) {
    const json = (await res.json()) as ApiResp<unknown>;
    if (!json.ok) return { ok: false as const, message: json.error.message || "Logo Upload fehlgeschlagen.", traceId: json.traceId };
    return { ok: true as const };
  }

  if (!res.ok) return { ok: false as const, message: "Logo Upload fehlgeschlagen.", traceId: undefined };
  return { ok: true as const };
}

async function deleteLogo(): Promise<{ ok: true } | { ok: false; message: string; traceId?: string }> {
  const res = await fetch("/api/admin/v1/tenants/current/logo", { method: "DELETE" });
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  if (ct.includes("application/json")) {
    const json = (await res.json()) as ApiResp<unknown>;
    if (!json.ok) return { ok: false as const, message: json.error.message || "Logo konnte nicht entfernt werden.", traceId: json.traceId };
    return { ok: true as const };
  }

  if (!res.ok) return { ok: false as const, message: "Logo konnte nicht entfernt werden.", traceId: undefined };
  return { ok: true as const };
}

function mapDtoToForm(dto: BrandingGetDto): FormState {
  const p = dto.profile;
  if (!p) {
    return {
      legalName: dto.tenant.name || "",
      displayName: null,

      addressLine1: null,
      addressLine2: null,
      postalCode: null,
      city: null,
      countryCode: dto.tenant.country || "CH",

      vatId: null,

      contactGivenName: null,
      contactFamilyName: null,
      contactEmail: null,

      accentColor: dto.tenant.accentColor ?? null,
    };
  }

  return {
    legalName: p.legalName,
    displayName: p.displayName,

    addressLine1: p.addressLine1,
    addressLine2: p.addressLine2,
    postalCode: p.postalCode,
    city: p.city,
    countryCode: p.countryCode || "CH",

    vatId: p.vatId,

    contactGivenName: p.contactGivenName,
    contactFamilyName: p.contactFamilyName,
    contactEmail: p.contactEmail,

    accentColor: p.accentColor,
  };
}

export default function BrandingScreenClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tenant, setTenant] = useState<TenantDto | null>(null);

  const [initial, setInitial] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState>({
    legalName: "",
    displayName: null,

    addressLine1: null,
    addressLine2: null,
    postalCode: null,
    city: null,
    countryCode: "CH",

    vatId: null,

    contactGivenName: null,
    contactFamilyName: null,
    contactEmail: null,

    accentColor: null,
  });

  const [loadError, setLoadError] = useState<{ message: string; traceId?: string } | null>(null);
  const [inlineError, setInlineError] = useState<{ message: string; traceId?: string } | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoLocalPreview, setLogoLocalPreview] = useState<string | null>(null);
  const [logoServerOk, setLogoServerOk] = useState<boolean>(true);

  // IMPORTANT: no Date.now() in initial state (SSR hydration mismatch)
  const [logoBust, setLogoBust] = useState<number>(0);

  const logoServerSrc = useMemo(() => makeLogoSrc(logoBust), [logoBust]);

  const dirty = useMemo(() => {
    if (!initial) return false;
    const formDirty = stableStringify(initial) !== stableStringify(form);
    const logoDirty = !!logoFile;
    return formDirty || logoDirty;
  }, [initial, form, logoFile]);

  const canSave = useMemo(() => {
    return form.legalName.trim().length >= 2 && dirty && !saving;
  }, [form.legalName, dirty, saving]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setInlineError(null);

    try {
      const res = await fetch("/api/admin/v1/branding", { method: "GET" });
      const json = (await res.json()) as ApiResp<BrandingGetDto>;

      if (!json.ok) {
        setLoadError({ message: json.error.message || "Fehler beim Laden.", traceId: json.traceId });
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
    const id = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(id);
    };
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

    if (!isAllowedLogoFile(file)) {
      setInlineError({ message: "Bitte nur PNG, JPG, WebP oder SVG als Logo hochladen.", traceId: undefined });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > 2_000_000) {
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

      // Clear local pick state
      setLogoFile(null);
      if (logoLocalPreview) URL.revokeObjectURL(logoLocalPreview);
      setLogoLocalPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      // Refresh server preview
      setLogoServerOk(true);
      setLogoBust(Date.now());

      // Notify others (topbar/accent provider)
      window.dispatchEvent(new Event(BRANDING_UPDATED_EVENT));

      setToast("Logo entfernt.");
      window.setTimeout(() => setToast(null), 1800);

      setSaving(false);
    } catch {
      setInlineError({ message: "Netzwerkfehler beim Entfernen.", traceId: undefined });
      setSaving(false);
    }
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

      const payload = {
        legalName: form.legalName.trim(),

        displayName: form.displayName,

        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2,
        postalCode: form.postalCode,
        city: form.city,
        countryCode: form.countryCode,

        vatId: form.vatId,

        contactGivenName: form.contactGivenName,
        contactFamilyName: form.contactFamilyName,
        contactEmail: form.contactEmail,

        accentColor: form.accentColor,
      };

      const res = await fetch("/api/admin/v1/branding", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as ApiResp<{ tenant: TenantDto; profile: ProfileDto | null }>;

      if (!json.ok) {
        setInlineError({ message: json.error.message || "Fehler beim Speichern.", traceId: json.traceId });
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

  const normalizedHex = useMemo(() => {
    if (form.accentColor && isHexColor(form.accentColor)) return form.accentColor.toUpperCase();
    return null;
  }, [form.accentColor]);

  const rgb = useMemo(() => {
    const base = normalizedHex ?? "#000000";
    return hexToRgb(base) ?? { r: 0, g: 0, b: 0 };
  }, [normalizedHex]);

  const cmyk = useMemo(() => rgbToCmyk(rgb), [rgb]);

  function setFromRgb(next: Partial<RGB>) {
    const merged: RGB = {
      r: next.r ?? rgb.r,
      g: next.g ?? rgb.g,
      b: next.b ?? rgb.b,
    };
    setField("accentColor", rgbToHex(merged));
  }

  function setFromCmyk(next: Partial<CMYK>) {
    const merged: CMYK = {
      c: next.c ?? cmyk.c,
      m: next.m ?? cmyk.m,
      y: next.y ?? cmyk.y,
      k: next.k ?? cmyk.k,
    };
    const nextRgb = cmykToRgb(merged);
    setField("accentColor", rgbToHex(nextRgb));
  }

  return (
    <div className="space-y-6">
      <header className="lr-pageHeader space-y-2">
        <h1 className="lr-h1">Branding &amp; Firma</h1>
        <p className="lr-muted">Logo, Farben und Rechnungsadresse – für Wiedererkennung und Belege.</p>
      </header>

      {loading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="h-4 w-40 rounded bg-slate-100" />
          <div className="mt-3 h-10 w-full rounded bg-slate-100" />
          <div className="mt-3 h-10 w-full rounded bg-slate-100" />
        </section>
      ) : loadError ? (
        <ErrorState
          title="Konnte Branding nicht laden"
          message={loadError.message}
          traceId={loadError.traceId}
          onRetry={() => void load()}
        />
      ) : (
        <>
          <Card title="Branding" subtitle="Logo (PNG/JPG/WebP/SVG) und optionale Akzentfarbe – wird in App & Admin verwendet.">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Logo preview (nice, not tiny icon) */}
              <div className="space-y-3">
                <Label>Logo Vorschau</Label>
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
                  <Label>Logo ändern</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
                    className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-xl file:border file:border-slate-200 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-50"
                    onChange={(e) => onPickLogo(e.target.files?.[0] ?? null)}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" type="button" onClick={onRemoveLogo} disabled={saving}>
                      Logo entfernen
                    </Button>
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => {
                        setLogoServerOk(true);
                        setLogoBust(Date.now());
                      }}
                    >
                      Vorschau aktualisieren
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">Empfohlen: transparentes PNG. Max. 2 MB.</p>
                </div>
              </div>

              {/* Color picker + formats */}
              <div className="space-y-3">
                <Label>Akzentfarbe</Label>

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
                            "lr-focusRing h-9 w-9 rounded-xl border transition",
                            active ? "border-slate-900" : "border-slate-200 hover:border-slate-300",
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
                        "lr-focusRing h-9 rounded-xl border px-3 text-xs font-semibold transition",
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
                        className="lr-focusRing h-10 w-12 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
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
                      <Input
                        value={form.accentColor ?? ""}
                        placeholder="#RRGGBB"
                        onChange={(e) => setField("accentColor", normalizeNull(e.target.value))}
                        onBlur={(e) => setField("accentColor", normalizeHexLoose(e.target.value))}
                      />
                    </div>

                    <Button variant="secondary" type="button" onClick={() => setField("accentColor", null)}>
                      Entfernen
                    </Button>

                    <Button variant="ghost" type="button" onClick={() => void copyHex()} disabled={!form.accentColor}>
                      HEX kopieren
                    </Button>
                  </div>

                  {/* RGB */}
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-slate-600">RGB — R</div>
                      <Input
                        type="number"
                        min={0}
                        max={255}
                        value={rgb.r}
                        onChange={(e) => setFromRgb({ r: clampInt(Number(e.target.value), 0, 255) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-slate-600">RGB — G</div>
                      <Input
                        type="number"
                        min={0}
                        max={255}
                        value={rgb.g}
                        onChange={(e) => setFromRgb({ g: clampInt(Number(e.target.value), 0, 255) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-slate-600">RGB — B</div>
                      <Input
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
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={cmyk.c}
                        onChange={(e) => setFromCmyk({ c: clampInt(Number(e.target.value), 0, 100) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-slate-600">CMYK — M</div>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={cmyk.m}
                        onChange={(e) => setFromCmyk({ m: clampInt(Number(e.target.value), 0, 100) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-slate-600">CMYK — Y</div>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={cmyk.y}
                        onChange={(e) => setFromCmyk({ y: clampInt(Number(e.target.value), 0, 100) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-slate-600">CMYK — K</div>
                      <Input
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
          </Card>

          <Card title="Firma / Rechnungsadresse" subtitle="Diese Daten sind Basis für Belege und spätere Rechnungen.">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Offizieller Firmenname *</Label>
                <Input
                  value={form.legalName}
                  placeholder={tenant?.name ?? "Firmenname"}
                  onChange={(e) => setField("legalName", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Adresse</Label>
                <Input value={form.addressLine1 ?? ""} onChange={(e) => setField("addressLine1", normalizeNull(e.target.value))} />
              </div>

              <div className="space-y-2">
                <Label>Adresszusatz</Label>
                <Input value={form.addressLine2 ?? ""} onChange={(e) => setField("addressLine2", normalizeNull(e.target.value))} />
              </div>

              <div className="space-y-2">
                <Label>PLZ</Label>
                <Input value={form.postalCode ?? ""} onChange={(e) => setField("postalCode", normalizeNull(e.target.value))} />
              </div>

              <div className="space-y-2">
                <Label>Ort</Label>
                <Input value={form.city ?? ""} onChange={(e) => setField("city", normalizeNull(e.target.value))} />
              </div>

              <div className="space-y-2">
                <Label>Land</Label>
                <select
                  className="lr-select lr-focusRing"
                  value={form.countryCode}
                  onChange={(e) => setField("countryCode", e.target.value)}
                >
                  <option value="CH">CH — Schweiz</option>
                  <option value="DE">DE — Deutschland</option>
                  <option value="AT">AT — Österreich</option>
                  <option value="LI">LI — Liechtenstein</option>
                  <option value="FR">FR — Frankreich</option>
                  <option value="IT">IT — Italien</option>
                  <option value="GB">GB — Vereinigtes Königreich</option>
                  <option value="US">US — USA</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>UID / MWST (optional)</Label>
                <Input value={form.vatId ?? ""} onChange={(e) => setField("vatId", normalizeNull(e.target.value))} />
              </div>
            </div>
          </Card>

          <Card title="Ansprechpartner" subtitle="Optional – für spätere Kommunikation / Belege.">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Vorname</Label>
                <Input value={form.contactGivenName ?? ""} onChange={(e) => setField("contactGivenName", normalizeNull(e.target.value))} />
              </div>

              <div className="space-y-2">
                <Label>Nachname</Label>
                <Input value={form.contactFamilyName ?? ""} onChange={(e) => setField("contactFamilyName", normalizeNull(e.target.value))} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>E-Mail</Label>
                <Input
                  value={form.contactEmail ?? ""}
                  onChange={(e) => setField("contactEmail", normalizeNull(e.target.value))}
                  placeholder="name@firma.ch"
                />
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">{dirty ? "Ungespeicherte Änderungen." : "Keine Änderungen."}</div>

            <div className="flex items-center gap-2">
              {dirty ? (
                <Button variant="secondary" onClick={reset} disabled={saving} type="button">
                  Änderungen verwerfen
                </Button>
              ) : null}

              <Button variant="primary" onClick={save} disabled={!canSave} type="button">
                {saving ? "Speichert…" : "Speichern"}
              </Button>
            </div>
          </div>
        </>
      )}

      {toast ? <Toast text={toast} /> : null}
    </div>
  );
}
