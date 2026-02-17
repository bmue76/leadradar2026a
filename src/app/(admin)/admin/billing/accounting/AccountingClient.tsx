"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Input, Select } from "../../_ui/Input";

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

  // keep displayName to avoid clobbering Tenant.name logic in API
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

  // keep accentColor untouched (not shown here)
  accentColor: string | null;
};

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

function stableStringify(v: unknown): string {
  return JSON.stringify(v);
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

export default function AccountingClient() {
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

  const dirty = useMemo(() => {
    if (!initial) return false;
    return stableStringify(initial) !== stableStringify(form);
  }, [initial, form]);

  const canSave = useMemo(() => {
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
        const traceId =
          res.headers.get("x-trace-id") ??
          (json && isRecord(json) ? (pickString(json.traceId) ?? undefined) : undefined);

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
  }

  async function save() {
    if (!canSave) return;

    setSaving(true);
    setInlineError(null);

    try {
      // IMPORTANT: Always send displayName explicitly to avoid clobbering Tenant.name logic in API.
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

        // keep accentColor unchanged (explicit)
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
        const traceId =
          res.headers.get("x-trace-id") ??
          (json && isRecord(json) ? (pickString(json.traceId) ?? undefined) : undefined);

        const msg =
          json && isRecord(json) && json.ok === false && isRecord(json.error) && typeof json.error.message === "string"
            ? json.error.message
            : "Fehler beim Speichern.";

        setInlineError({ message: msg, traceId });
        setSaving(false);
        return;
      }

      setTenant(json.data.tenant);

      // re-fetch for canonical state (server normalizations)
      await load();

      setToast("Gespeichert.");
      window.setTimeout(() => setToast(null), 1800);

      setSaving(false);
    } catch {
      setInlineError({ message: "Netzwerkfehler beim Speichern.", traceId: undefined });
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="lr-pageHeader space-y-2">
        <h1 className="lr-h1">Firma &amp; Belege</h1>
        <p className="lr-muted">Rechnungsadresse, UID/MWST und Kontakt für Belege &amp; spätere Abrechnung.</p>
      </header>

      {loading ? (
        <section className="lr-panel">
          <div className="h-4 w-44 rounded bg-slate-100" />
          <div className="mt-3 h-10 w-full rounded bg-slate-100" />
          <div className="mt-3 h-10 w-full rounded bg-slate-100" />
        </section>
      ) : loadError ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <h2 className="text-base font-semibold text-rose-900">Konnte Daten nicht laden</h2>
          <p className="mt-1 text-sm text-rose-800">{loadError.message}</p>
          {loadError.traceId ? (
            <p className="mt-2 text-xs text-rose-700">
              TraceId: <span className="font-mono">{loadError.traceId}</span>
            </p>
          ) : null}
          <div className="mt-4">
            <button className="lr-btnSecondary" type="button" onClick={() => void load()}>
              Erneut versuchen
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="lr-panel">
            <h2 className="lr-h2">Firma / Rechnungsadresse</h2>
            <p className="mt-1 lr-muted">Diese Daten sind Basis für Belege und spätere Rechnungen.</p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <div className="lr-fieldLabel">Offizieller Firmenname *</div>
                <Input
                  value={form.legalName}
                  placeholder={tenant?.name ?? "Firmenname"}
                  onChange={(e) => setField("legalName", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="lr-fieldLabel">Adresse</div>
                <Input
                  value={form.addressLine1 ?? ""}
                  onChange={(e) => setField("addressLine1", normalizeNull(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <div className="lr-fieldLabel">Adresszusatz</div>
                <Input
                  value={form.addressLine2 ?? ""}
                  onChange={(e) => setField("addressLine2", normalizeNull(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <div className="lr-fieldLabel">PLZ</div>
                <Input
                  value={form.postalCode ?? ""}
                  onChange={(e) => setField("postalCode", normalizeNull(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <div className="lr-fieldLabel">Ort</div>
                <Input
                  value={form.city ?? ""}
                  onChange={(e) => setField("city", normalizeNull(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <div className="lr-fieldLabel">Land</div>
                <Select value={form.countryCode} onChange={(e) => setField("countryCode", e.target.value)}>
                  <option value="CH">CH — Schweiz</option>
                  <option value="DE">DE — Deutschland</option>
                  <option value="AT">AT — Österreich</option>
                  <option value="LI">LI — Liechtenstein</option>
                  <option value="FR">FR — Frankreich</option>
                  <option value="IT">IT — Italien</option>
                  <option value="GB">GB — Vereinigtes Königreich</option>
                  <option value="US">US — USA</option>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="lr-fieldLabel">UID / MWST (optional)</div>
                <Input
                  value={form.vatId ?? ""}
                  onChange={(e) => setField("vatId", normalizeNull(e.target.value))}
                />
              </div>
            </div>
          </section>

          <section className="lr-panel">
            <h2 className="lr-h2">Ansprechpartner</h2>
            <p className="mt-1 lr-muted">Optional – für spätere Kommunikation / Belege.</p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="lr-fieldLabel">Vorname</div>
                <Input
                  value={form.contactGivenName ?? ""}
                  onChange={(e) => setField("contactGivenName", normalizeNull(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <div className="lr-fieldLabel">Nachname</div>
                <Input
                  value={form.contactFamilyName ?? ""}
                  onChange={(e) => setField("contactFamilyName", normalizeNull(e.target.value))}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <div className="lr-fieldLabel">E-Mail</div>
                <Input
                  value={form.contactEmail ?? ""}
                  onChange={(e) => setField("contactEmail", normalizeNull(e.target.value))}
                  placeholder="name@firma.ch"
                />
              </div>
            </div>

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
          </section>

          <section className="lr-panel">
            <h2 className="lr-h2">Tenant-Inhaber</h2>
            <p className="mt-1 lr-muted">Übergabe/Übertragung (z.B. Mitarbeiteraustritt) kommt als eigener Flow (TP7.4+). MVP: Owner-only.</p>
          </section>

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
