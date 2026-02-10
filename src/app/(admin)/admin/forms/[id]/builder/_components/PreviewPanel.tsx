"use client";

import React, { useMemo } from "react";
import type { BuilderField } from "../builder.types";

function isContactField(f: BuilderField) {
  const cfg = (f as any)?.config;
  if (cfg?.system?.section === "CONTACT") return true;

  // fallback: bekannte Kontaktkeys
  const k = String((f as any)?.key || "");
  return ["firstName", "lastName", "company", "email", "phone", "address", "zip", "city", "country", "website"].includes(k);
}

function isAttachment(field: BuilderField) {
  return (field as any)?.config?.ui?.variant === "attachment";
}

function isStars(field: BuilderField) {
  return (field as any)?.config?.ui?.variant === "stars";
}

export default function PreviewPanel({ fields }: { fields: BuilderField[] }) {
  const { formFields, contactFields } = useMemo(() => {
    const a: BuilderField[] = [];
    const b: BuilderField[] = [];
    for (const f of fields) (isContactField(f) ? b : a).push(f);
    return { formFields: a, contactFields: b };
  }, [fields]);

  return (
    <div className="flex flex-col gap-4">
      {/* Screen 1 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-900">Screen 1 – Formular</div>
        <div className="mt-1 text-xs text-slate-500">Individuelle Felder (scrollt in der App).</div>

        <div className="mt-4 flex flex-col gap-4">
          {formFields.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              Keine Formularfelder – füge links Felder hinzu.
            </div>
          ) : null}

          {formFields.map((f) => (
            <div key={f.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-slate-900">{f.label}</div>
                {f.required ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">Pflicht</span>
                ) : null}
              </div>

              {(f as any).helpText ? <div className="mt-1 text-xs text-slate-500">{(f as any).helpText}</div> : null}

              <div className="mt-2">
                {isAttachment(f) ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900">
                      Datei auswählen
                    </button>
                    <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900">
                      Foto aufnehmen
                    </button>
                    <div className="text-xs text-slate-500">Bilder / PDF (mehrfach möglich)</div>
                  </div>
                ) : null}

                {isStars(f) ? (
                  <div className="flex items-center gap-1 text-lg">
                    <span>☆</span><span>☆</span><span>☆</span><span>☆</span><span>☆</span>
                  </div>
                ) : null}

                {(f.type === "SINGLE_SELECT" || f.type === "MULTI_SELECT") && !isStars(f) ? (
                  <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
                    <option value="">Bitte wählen…</option>
                    {Array.isArray((f as any).config?.options)
                      ? (f as any).config.options.map((o: string) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))
                      : null}
                  </select>
                ) : null}

                {f.type === "CHECKBOX" ? (
                  <label className="flex items-center gap-2 text-sm text-slate-900">
                    <input type="checkbox" />
                    {f.label}
                  </label>
                ) : null}

                {(f.type === "TEXT" || f.type === "EMAIL" || f.type === "PHONE") && !isAttachment(f) ? (
                  <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" placeholder={(f as any).placeholder ?? ""} />
                ) : null}

                {f.type === "TEXTAREA" ? (
                  <textarea className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" rows={4} placeholder={(f as any).placeholder ?? ""} />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Screen 2 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-900">Screen 2 – Kontakt</div>
        <div className="mt-1 text-xs text-slate-500">Kontakt-Infos + Erfassungsart auswählen.</div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900">
            Visitenkarte scannen
          </button>
          <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900">
            Badge/QR scannen
          </button>
          <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900">
            Manuell erfassen
          </button>
          <button type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900">
            Aus Kontakten wählen
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {contactFields.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              Keine Kontaktfelder – füge links unter “Kontaktfelder” Felder hinzu oder wähle einen Standardblock.
            </div>
          ) : null}

          {contactFields.map((f) => (
            <div key={f.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-slate-900">{f.label}</div>
                {f.required ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">Pflicht</span>
                ) : null}
              </div>
              <div className="mt-2">
                <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
