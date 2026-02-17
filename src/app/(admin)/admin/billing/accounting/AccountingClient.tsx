"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

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
} | null;

type BrandingGetDto = { tenant: TenantDto; profile: ProfileDto };

type UiState =
  | { kind: "idle" }
  | { kind: "loading"; message?: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string; traceId?: string };

type FormState = {
  legalName: string;

  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;

  vatId: string | null;

  contactGivenName: string | null;
  contactFamilyName: string | null;
  contactEmail: string | null;

  // wichtig: damit PATCH legalName/displayName/accent nicht "verliert"
  // displayName/accentColor editieren wir hier NICHT, aber wir schicken sie bewusst nicht mit (API ist jetzt safe).
};

const BRANDING_UPDATED_EVENT = "lr_tenant_branding_updated";

function normalizeNull(s: string): string | null {
  const t = s.trim();
  return t.length ? t : null;
}

function stableStringify(v: unknown): string {
  return JSON.stringify(v);
}

function mapDto(dto: BrandingGetDto): FormState {
  const p = dto.profile;

  const legalName = (p?.legalName || dto.tenant.name || "").trim();

  return {
    legalName: legalName.length ? legalName : "LeadRadar",

    addressLine1: p?.addressLine1 ?? null,
    addressLine2: p?.addressLine2 ?? null,
    postalCode: p?.postalCode ?? null,
    city: p?.city ?? null,
    countryCode: (p?.countryCode || dto.tenant.country || "CH").trim() || "CH",

    vatId: p?.vatId ?? null,

    contactGivenName: p?.contactGivenName ?? null,
    contactFamilyName: p?.contactFamilyName ?? null,
    contactEmail: p?.contactEmail ?? null,
  };
}

export default function AccountingClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [ui, setUi] = useState<UiState>({ kind: "idle" });

  const [initial, setInitial] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState>({
    legalName: "",
    addressLine1: null,
    addressLine2: null,
    postalCode: null,
    city: null,
    countryCode: "CH",
    vatId: null,
    contactGivenName: null,
    contactFamilyName: null,
    contactEmail: null,
  });

  const [toast, setToast] = useState<string | null>(null);

  const dirty = useMemo(() => {
    if (!initial) return false;
    return stableStringify(initial) !== stableStringify(form);
  }, [initial, form]);

  const canSave = useMemo(() => {
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
  }

  async function save() {
    if (!canSave) return;

    setSaving(true);
    setUi({ kind: "loading", message: "Speichert…" });

    try {
      const payload = {
        legalName: form.legalName.trim(),

        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2,
        postalCode: form.postalCode,
        city: form.city,
        countryCode: form.countryCode,

        vatId: form.vatId,

        contactGivenName: form.contactGivenName,
        contactFamilyName: form.contactFamilyName,
        contactEmail: form.contactEmail,
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

      // topbar, etc.
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
        <h1 className="lr-h1">Billing / Accounting</h1>
        <p className="lr-muted">Rechnungsadresse, UID/MWST und Ansprechpartner – Basis für Belege und spätere Rechnungen.</p>
      </header>

      {loading ? (
        <div className="lr-panel">
          <div className="h-4 w-48 rounded bg-slate-100" />
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
                <div className="lr-h2">Firma / Rechnungsadresse</div>
                <div className="lr-muted mt-1">Wird für Belege, Abrechnung und spätere Rechnungen verwendet.</div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <div className="text-sm font-medium text-slate-800">Offizieller Firmenname *</div>
                <input
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.legalName}
                  onChange={(e) => setField("legalName", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-800">Adresse</div>
                <input
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.addressLine1 ?? ""}
                  onChange={(e) => setField("addressLine1", normalizeNull(e.target.value))}
                  onBlur={(e) => setField("addressLine1", normalizeNull(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-800">Adresszusatz</div>
                <input
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.addressLine2 ?? ""}
                  onChange={(e) => setField("addressLine2", normalizeNull(e.target.value))}
                  onBlur={(e) => setField("addressLine2", normalizeNull(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-800">PLZ</div>
                <input
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.postalCode ?? ""}
                  onChange={(e) => setField("postalCode", normalizeNull(e.target.value))}
                  onBlur={(e) => setField("postalCode", normalizeNull(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-800">Ort</div>
                <input
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.city ?? ""}
                  onChange={(e) => setField("city", normalizeNull(e.target.value))}
                  onBlur={(e) => setField("city", normalizeNull(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-800">Land</div>
                <select
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
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
                <div className="text-sm font-medium text-slate-800">UID / MWST (optional)</div>
                <input
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.vatId ?? ""}
                  onChange={(e) => setField("vatId", normalizeNull(e.target.value))}
                  onBlur={(e) => setField("vatId", normalizeNull(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="lr-panel">
            <div className="lr-panelHeader">
              <div>
                <div className="lr-h2">Ansprechpartner</div>
                <div className="lr-muted mt-1">Optional – für Abrechnung / Belege / Rückfragen.</div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-800">Vorname</div>
                <input
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.contactGivenName ?? ""}
                  onChange={(e) => setField("contactGivenName", normalizeNull(e.target.value))}
                  onBlur={(e) => setField("contactGivenName", normalizeNull(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-800">Nachname</div>
                <input
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.contactFamilyName ?? ""}
                  onChange={(e) => setField("contactFamilyName", normalizeNull(e.target.value))}
                  onBlur={(e) => setField("contactFamilyName", normalizeNull(e.target.value))}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <div className="text-sm font-medium text-slate-800">E-Mail</div>
                <input
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.contactEmail ?? ""}
                  placeholder="name@firma.ch"
                  onChange={(e) => setField("contactEmail", normalizeNull(e.target.value))}
                  onBlur={(e) => setField("contactEmail", normalizeNull(e.target.value))}
                />
              </div>
            </div>

            {ui.kind === "loading" ? <div className="lr-muted mt-4">{ui.message || "Bitte warten…"}</div> : null}
            {ui.kind === "success" ? <div className="mt-4 text-sm text-slate-700">{ui.message}</div> : null}
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

          {/* Placeholder: Owner-Transfer (später) */}
          <div className="lr-panel">
            <div className="lr-h2">Tenant-Inhaber übertragen</div>
            <p className="lr-muted mt-2">
              Kommt als nächster Block: Übergabe bei Mitarbeiteraustritt (2-Step Transfer, leak-safe).
            </p>
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
