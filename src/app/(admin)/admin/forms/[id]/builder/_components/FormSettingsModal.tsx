"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { BuilderForm, FieldSection, FormStatus } from "../builder.types";

export type ContactPolicy = "NONE" | "EMAIL_OR_PHONE" | "EMAIL" | "PHONE";

export type CaptureModes = {
  businessCard: boolean;
  qr: boolean;
  contacts: boolean;
  manual: boolean;
};

export type FormConfigShape = {
  startScreen?: FieldSection;
  ctaFormToContactLabel?: string;
  ctaContactSubmitLabel?: string;
  contactPolicy?: ContactPolicy;
  captureModes?: Partial<CaptureModes>;
};

export type FormSettingsDraft = {
  name: string;
  status: FormStatus;
  description: string | null;
  config: Record<string, unknown> | null;
};

type SaveResult = { ok: true } | { ok: false; message: string };

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getCfg(form: BuilderForm | null): Record<string, unknown> {
  const raw = form?.config;
  return isRecord(raw) ? { ...raw } : {};
}

function getCaptureModes(cfg: Record<string, unknown>): CaptureModes {
  const raw = cfg.captureModes;
  const base: CaptureModes = { businessCard: true, qr: true, contacts: true, manual: true };
  if (!isRecord(raw)) return base;

  const pickBool = (k: keyof CaptureModes) => (typeof raw[k] === "boolean" ? (raw[k] as boolean) : base[k]);
  return {
    businessCard: pickBool("businessCard"),
    qr: pickBool("qr"),
    contacts: pickBool("contacts"),
    manual: pickBool("manual"),
  };
}

export default function FormSettingsModal(props: {
  open: boolean;
  form: BuilderForm;
  onClose: () => void;
  onSave: (draft: FormSettingsDraft) => Promise<SaveResult>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const baseCfg = useMemo(() => getCfg(props.form), [props.form?.id]);

  const [name, setName] = useState(props.form.name);
  const [status, setStatus] = useState<FormStatus>(props.form.status);
  const [description, setDescription] = useState<string>(props.form.description ?? "");

  const [startScreen, setStartScreen] = useState<FieldSection>("FORM");
  const [cta1, setCta1] = useState("Kontakt erfassen");
  const [cta2, setCta2] = useState("Lead speichern");

  const [contactPolicy, setContactPolicy] = useState<ContactPolicy>("NONE");
  const [modes, setModes] = useState<CaptureModes>({ businessCard: true, qr: true, contacts: true, manual: true });

  useEffect(() => {
    if (!props.open) return;

    setErr(null);
    setBusy(false);

    setName(props.form.name);
    setStatus(props.form.status);
    setDescription(props.form.description ?? "");

    const cfg = getCfg(props.form);

    setStartScreen((cfg.startScreen === "CONTACT" ? "CONTACT" : "FORM") as FieldSection);

    setCta1(typeof cfg.ctaFormToContactLabel === "string" && cfg.ctaFormToContactLabel.trim() ? (cfg.ctaFormToContactLabel as string) : "Kontakt erfassen");
    setCta2(typeof cfg.ctaContactSubmitLabel === "string" && cfg.ctaContactSubmitLabel.trim() ? (cfg.ctaContactSubmitLabel as string) : "Lead speichern");

    const pol = cfg.contactPolicy;
    setContactPolicy((pol === "EMAIL" || pol === "PHONE" || pol === "EMAIL_OR_PHONE" ? pol : "NONE") as ContactPolicy);

    setModes(getCaptureModes(cfg));
  }, [props.open, props.form?.id]);

  if (!props.open) return null;

  const buildConfig = (): Record<string, unknown> | null => {
    // merge into existing config to avoid data loss
    const next: Record<string, unknown> = { ...baseCfg };

    next.startScreen = startScreen;
    next.ctaFormToContactLabel = cta1.trim() || "Kontakt erfassen";
    next.ctaContactSubmitLabel = cta2.trim() || "Lead speichern";
    next.contactPolicy = contactPolicy;

    // keep clean: only write captureModes if not all true
    const allTrue = modes.businessCard && modes.qr && modes.contacts && modes.manual;
    if (allTrue) {
      delete next.captureModes;
    } else {
      next.captureModes = { ...modes };
    }

    return next;
  };

  const submit = async () => {
    setErr(null);

    const n = name.trim();
    if (!n) {
      setErr("Bitte einen Formularnamen eingeben.");
      return;
    }

    setBusy(true);
    const res = await props.onSave({
      name: n,
      status,
      description: description.trim() ? description.trim() : null,
      config: buildConfig(),
    });

    setBusy(false);

    if (!res.ok) {
      setErr(res.message);
      return;
    }

    props.onClose();
  };

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="Schliessen"
        onClick={() => (!busy ? props.onClose() : null)}
      />

      <div className="absolute inset-0 flex items-start justify-center p-4 md:p-8">
        <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">Formular-Einstellungen</div>
              <div className="truncate text-xs text-slate-500">{props.form.id}</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                onClick={props.onClose}
                disabled={busy}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                onClick={submit}
                disabled={busy}
              >
                Speichern
              </button>
            </div>
          </div>

          <div className="max-h-[calc(100vh-10rem)] overflow-auto px-6 py-6 space-y-6">
            {err ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {err}
              </div>
            ) : null}

            {/* Basics */}
            <section className="space-y-3">
              <div className="text-xs font-semibold text-slate-600">Basis</div>

              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-semibold text-slate-600">Formularname</label>
                <input
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-semibold text-slate-600">Status</label>
                <select
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as FormStatus)}
                >
                  <option value="DRAFT">Entwurf</option>
                  <option value="ACTIVE">Aktiv</option>
                  <option value="ARCHIVED">Archiviert</option>
                </select>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-semibold text-slate-600">Beschreibung (optional)</label>
                <textarea
                  className="min-h-[96px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </section>

            {/* Flow */}
            <section className="space-y-3">
              <div className="text-xs font-semibold text-slate-600">Ablauf in der App</div>

              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-semibold text-slate-600">Start-Screen</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={cx(
                      "rounded-full border px-3 py-2 text-sm font-semibold",
                      startScreen === "FORM"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    )}
                    onClick={() => setStartScreen("FORM")}
                  >
                    Screen 1: Formular
                  </button>
                  <button
                    type="button"
                    className={cx(
                      "rounded-full border px-3 py-2 text-sm font-semibold",
                      startScreen === "CONTACT"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    )}
                    onClick={() => setStartScreen("CONTACT")}
                  >
                    Screen 2: Kontakt
                  </button>
                </div>
                <div className="text-xs text-slate-500">Damit kann der Kunde wählen: zuerst Kontakt oder zuerst Formularfelder.</div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-semibold text-slate-600">CTA Screen 1 → Screen 2</label>
                <input
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  value={cta1}
                  onChange={(e) => setCta1(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-semibold text-slate-600">CTA Screen 2 (abschliessen)</label>
                <input
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  value={cta2}
                  onChange={(e) => setCta2(e.target.value)}
                />
              </div>
            </section>

            {/* Contact rules */}
            <section className="space-y-3">
              <div className="text-xs font-semibold text-slate-600">Kontakt-Regeln</div>

              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs font-semibold text-slate-600">Erforderliche Kontakt-Angaben</label>
                <select
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  value={contactPolicy}
                  onChange={(e) => setContactPolicy(e.target.value as ContactPolicy)}
                >
                  <option value="NONE">Keine Regel</option>
                  <option value="EMAIL_OR_PHONE">E-Mail oder Telefon</option>
                  <option value="EMAIL">E-Mail erforderlich</option>
                  <option value="PHONE">Telefon erforderlich</option>
                </select>
                <div className="text-xs text-slate-500">Wird in der App beim “Lead speichern” validiert.</div>
              </div>
            </section>

            {/* Capture modes */}
            <section className="space-y-3">
              <div className="text-xs font-semibold text-slate-600">Kontakt erfassen via</div>

              <div className="grid grid-cols-1 gap-2">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={modes.businessCard}
                    onChange={(e) => setModes((m) => ({ ...m, businessCard: e.target.checked }))}
                  />
                  Visitenkarte (Scan/OCR)
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={modes.qr}
                    onChange={(e) => setModes((m) => ({ ...m, qr: e.target.checked }))}
                  />
                  QR-Code
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={modes.contacts}
                    onChange={(e) => setModes((m) => ({ ...m, contacts: e.target.checked }))}
                  />
                  Kontakte (Adressbuch)
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={modes.manual}
                    onChange={(e) => setModes((m) => ({ ...m, manual: e.target.checked }))}
                  />
                  Manuell
                </label>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                Hinweis: Preview ist “UI-nah”, aber keine echte Geräte-Simulation. Der echte Emulator kommt später über Expo.
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
