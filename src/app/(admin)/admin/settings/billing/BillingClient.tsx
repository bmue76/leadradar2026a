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
};

type BrandingGetDto = { tenant: TenantDto; profile: ProfileDto | null };

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
};

function stableStringify(v: unknown): string {
  return JSON.stringify(v);
}

function normalizeNull(s: string): string | null {
  const t = s.trim();
  return t.length ? t : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function pickTraceIdFromJson(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const t = payload.traceId;
  return typeof t === "string" && t.trim() ? t.trim() : undefined;
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

function mapDtoToForm(dto: BrandingGetDto): FormState {
  const p = dto.profile;

  if (!p) {
    return {
      legalName: (dto.tenant.name || "").trim(),

      addressLine1: null,
      addressLine2: null,
      postalCode: null,
      city: null,
      countryCode: (dto.tenant.country || "CH").trim() || "CH",

      vatId: null,

      contactGivenName: null,
      contactFamilyName: null,
      contactEmail: null,
    };
  }

  return {
    legalName: (p.legalName || "").trim(),

    addressLine1: p.addressLine1,
    addressLine2: p.addressLine2,
    postalCode: p.postalCode,
    city: p.city,
    countryCode: (p.countryCode || "CH").trim() || "CH",

    vatId: p.vatId,

    contactGivenName: p.contactGivenName,
    contactFamilyName: p.contactFamilyName,
    contactEmail: p.contactEmail,
  };
}

export default function BillingClient() {
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

      const mapped = mapDtoToForm(json.data);
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

      const payloadJson = await safeReadJson(res);
      const traceId = (res.headers.get("x-trace-id") ?? pickTraceIdFromJson(payloadJson)) ?? undefined;

      if (!res.ok) {
        if (isRecord(payloadJson) && payloadJson.ok === false && isRecord(payloadJson.error)) {
          const msg = typeof payloadJson.error.message === "string" ? payloadJson.error.message : "Fehler beim Speichern.";
          setUi({ kind: "error", message: msg, traceId });
        } else {
          setUi({ kind: "error", message: "Fehler beim Speichern.", traceId });
        }
        setSaving(false);
        return;
      }

      // Expect standard { ok:true, data:{ tenant, profile }, traceId }
      const json = payloadJson as ApiResp<{ tenant: TenantDto; profile: ProfileDto | null }>;
      if (json && typeof (json as { ok?: unknown }).ok === "boolean" && (json as { ok: boolean }).ok !== true) {
        const err = (json as ApiErr).error;
        setUi({ kind: "error", message: err?.message || "Fehler beim Speichern.", traceId: (json as ApiErr).traceId });
        setSaving(false);
        return;
      }

      // Re-load from server response via GET (safer mapping)
      await load();

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
        <h1 className="lr-h1">Rechnungsdaten</h1>
        <p className="lr-muted">Basis für Belege und spätere Abrechnungen (MVP).</p>
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
                <div className="lr-h2">Firma / Rechnungsadresse</div>
                <div className="lr-muted mt-1">Diese Angaben erscheinen später auf Belegen/Rechnungen.</div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <div className="text-sm font-medium text-slate-800">Offizieller Firmenname *</div>
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.legalName}
                  onChange={(e) => setField("legalName", e.target.value)}
                  placeholder="Firmenname"
                />
              </div>

              <div>
                <div className="text-sm font-medium text-slate-800">Adresse</div>
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.addressLine1 ?? ""}
                  onChange={(e) => setField("addressLine1", normalizeNull(e.target.value))}
                />
              </div>

              <div>
                <div className="text-sm font-medium text-slate-800">Adresszusatz</div>
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.addressLine2 ?? ""}
                  onChange={(e) => setField("addressLine2", normalizeNull(e.target.value))}
                />
              </div>

              <div>
                <div className="text-sm font-medium text-slate-800">PLZ</div>
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.postalCode ?? ""}
                  onChange={(e) => setField("postalCode", normalizeNull(e.target.value))}
                />
              </div>

              <div>
                <div className="text-sm font-medium text-slate-800">Ort</div>
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.city ?? ""}
                  onChange={(e) => setField("city", normalizeNull(e.target.value))}
                />
              </div>

              <div>
                <div className="text-sm font-medium text-slate-800">Land</div>
                <select
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
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

              <div>
                <div className="text-sm font-medium text-slate-800">UID / MWST (optional)</div>
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.vatId ?? ""}
                  onChange={(e) => setField("vatId", normalizeNull(e.target.value))}
                  placeholder="CHE-…"
                />
              </div>
            </div>
          </div>

          <div className="lr-panel">
            <div className="lr-panelHeader">
              <div>
                <div className="lr-h2">Ansprechpartner</div>
                <div className="lr-muted mt-1">Optional – für spätere Kommunikation / Belege.</div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm font-medium text-slate-800">Vorname</div>
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.contactGivenName ?? ""}
                  onChange={(e) => setField("contactGivenName", normalizeNull(e.target.value))}
                />
              </div>

              <div>
                <div className="text-sm font-medium text-slate-800">Nachname</div>
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.contactFamilyName ?? ""}
                  onChange={(e) => setField("contactFamilyName", normalizeNull(e.target.value))}
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-sm font-medium text-slate-800">E-Mail</div>
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={form.contactEmail ?? ""}
                  onChange={(e) => setField("contactEmail", normalizeNull(e.target.value))}
                  placeholder="name@firma.ch"
                />
              </div>
            </div>

            {ui.kind === "loading" ? <div className="lr-muted mt-4">{ui.message || "Bitte warten…"}</div> : null}
            {ui.kind === "success" ? <div className="mt-4 text-sm text-slate-700">{ui.message}</div> : null}
          </div>

          <div className="lr-panel">
            <div className="lr-panelHeader">
              <div>
                <div className="lr-h2">Tenant Admin übertragen</div>
                <div className="lr-muted mt-1">
                  MVP: Platzhalter. Der eigentliche Transfer (Owner-Wechsel) kommt als eigenes Teilprojekt.
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm text-slate-700">
                Bei Mitarbeiteraustritt muss der Tenant-Owner übertragen werden können (z.B. auf einen neuen Admin).
              </div>
              <div className="lr-actions">
                <button className="lr-btnSecondary" type="button" disabled>
                  Übertragen (kommt später)
                </button>
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
