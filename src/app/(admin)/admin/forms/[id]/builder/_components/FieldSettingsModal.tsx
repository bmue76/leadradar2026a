// @ts-nocheck
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { BuilderField, FieldVariant } from "../builder.types";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function normalizeKey(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_");
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-slate-700">{children}</div>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900",
        "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200",
        props.className
      )}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900",
        "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200",
        props.className
      )}
    />
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left",
        disabled ? "cursor-not-allowed opacity-60" : "hover:bg-slate-50"
      )}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
    >
      <div>
        <div className="text-sm font-medium text-slate-900">{label}</div>
        {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
      </div>
      <span
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full border",
          checked ? "border-slate-900 bg-slate-900" : "border-slate-200 bg-slate-100"
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
            checked ? "translate-x-5" : "translate-x-1"
          )}
        />
      </span>
    </button>
  );
}

function OptionsEditor({
  options,
  onChange,
  disabled,
}: {
  options: string[];
  onChange: (opts: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-900">Optionen</div>
          <div className="mt-1 text-xs text-slate-500">Eine Option pro Zeile (Reihenfolge = Anzeige).</div>
        </div>
        <button
          type="button"
          className={cn(
            "rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 hover:bg-slate-50",
            disabled && "cursor-not-allowed opacity-60"
          )}
          disabled={disabled}
          onClick={() => onChange([...(options ?? []), `Option ${Math.max(1, (options?.length ?? 0) + 1)}`])}
        >
          + Option
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {(options ?? []).map((v, idx) => (
          <div key={`${idx}-${v}`} className="flex items-center gap-2">
            <Input
              value={v}
              disabled={disabled}
              onChange={(e) => {
                const next = [...options];
                next[idx] = e.target.value;
                onChange(next);
              }}
            />
            <button
              type="button"
              className={cn(
                "h-10 w-10 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                disabled && "cursor-not-allowed opacity-60"
              )}
              disabled={disabled}
              aria-label="Option löschen"
              onClick={() => {
                const next = options.filter((_, i) => i !== idx);
                onChange(next);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <button
          type="button"
          className={cn(
            "rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 hover:bg-slate-50",
            disabled && "cursor-not-allowed opacity-60"
          )}
          disabled={disabled}
          onClick={() => onChange((options ?? []).map((x) => x.trim()).filter(Boolean))}
        >
          Bereinigen (Trim + leere entfernen)
        </button>
      </div>
    </div>
  );
}

function VariantSelect({
  value,
  onChange,
  disabled,
}: {
  value: FieldVariant;
  onChange: (v: FieldVariant) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-sm font-medium text-slate-900">Darstellung</div>
      <div className="mt-1 text-xs text-slate-500">Wie dieses Feld in der App dargestellt wird.</div>

      <select
        className={cn(
          "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900",
          "focus:outline-none focus:ring-2 focus:ring-slate-200",
          disabled && "cursor-not-allowed opacity-60"
        )}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as FieldVariant)}
      >
        <option value="default">Standard</option>
        <option value="date">Datum-Picker</option>
        <option value="datetime">Datum + Uhrzeit</option>
        <option value="attachment">Dokument / Foto</option>
        <option value="audio">Audio (Sprachnotiz)</option>
      </select>
    </div>
  );
}

type Props = {
  open: boolean;
  field: BuilderField | null;
  readOnly?: boolean;

  // keys to validate uniqueness (form section only)
  existingKeys: Set<string>;

  onClose: () => void;
  onPatch: (id: string, patch: Partial<BuilderField>) => void;
};

export default function FieldSettingsModal({ open, field, readOnly, existingKeys, onClose, onPatch }: Props) {
  const disabled = !!readOnly;

  const isContact = (field?.config?.section ?? "FORM") === "CONTACT";
  const isTextLike = field?.type === "TEXT" || field?.type === "TEXTAREA" || field?.type === "EMAIL" || field?.type === "PHONE";

  const variant: FieldVariant = useMemo(() => {
    const v = (field?.config?.variant ?? "default") as FieldVariant;
    return v;
  }, [field]);

  const [keyDraft, setKeyDraft] = useState(field?.key ?? "");
  useEffect(() => setKeyDraft(field?.key ?? ""), [field?.id]); // reset per open

  if (!open || !field) return null;

  const showOptions = field.type === "SINGLE_SELECT" || field.type === "MULTI_SELECT" || field.type === "YESNO";
  const showRating = field.type === "RATING";
  const showVariant = field.type === "TEXT"; // we use TEXT + variant for date/datetime/attachment/audio presets

  const cfg = field.config ?? {};
  const opts = (cfg.options ?? []) as string[];

  function patchConfig(p: any) {
    onPatch(field.id, { config: { ...(field.config ?? {}), ...p } });
  }

  function commitKey() {
    if (isContact) return;

    const normalized = normalizeKey(keyDraft);
    if (!normalized) {
      setKeyDraft(field.key);
      return;
    }

    // uniqueness (exclude current key)
    const keys = new Set(existingKeys);
    keys.delete(field.key);

    let finalKey = normalized;
    if (keys.has(finalKey)) {
      let i = 2;
      while (keys.has(`${finalKey}_${i}`)) i++;
      finalKey = `${finalKey}_${i}`;
    }

    setKeyDraft(finalKey);
    onPatch(field.id, { key: finalKey });
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="absolute left-1/2 top-1/2 w-[min(720px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">Feld bearbeiten</div>
              <div className="mt-1 truncate text-xs text-slate-500">
                {isContact ? "Kontaktfeld" : "Formularfeld"} • {field.type} • {field.key}
              </div>
            </div>

            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
              onClick={onClose}
            >
              Schliessen
            </button>
          </div>

          <div className="max-h-[70vh] overflow-auto p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <Label>Label</Label>
                <Input
                  value={field.label}
                  disabled={disabled}
                  onChange={(e) => onPatch(field.id, { label: e.target.value })}
                />
                <div className="mt-2 text-xs text-slate-500">So erscheint das Feld im Formular.</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <Label>Key</Label>
                <Input
                  value={keyDraft}
                  disabled={disabled || isContact}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  onBlur={commitKey}
                />
                <div className="mt-2 text-xs text-slate-500">
                  Technischer Schlüssel (z. B. für Export). {isContact ? "Kontaktfelder haben einen fixen Key." : "Wird normalisiert & eindeutig gemacht."}
                </div>
              </div>

              <Toggle
                checked={field.required}
                disabled={disabled}
                onChange={(v) => onPatch(field.id, { required: v })}
                label="Pflichtfeld"
                hint="Muss in der App ausgefüllt werden."
              />

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <Label>Hilfe-Text</Label>
                <Textarea
                  rows={3}
                  value={field.helpText ?? ""}
                  disabled={disabled}
                  onChange={(e) => onPatch(field.id, { helpText: e.target.value })}
                  placeholder="Optionaler Hinweis unter dem Feld"
                />
              </div>

              <div className={cn("rounded-2xl border border-slate-200 bg-white p-3", !isTextLike && "opacity-60")}>
                <Label>Placeholder</Label>
                <Input
                  value={field.placeholder ?? ""}
                  disabled={disabled || !isTextLike}
                  onChange={(e) => onPatch(field.id, { placeholder: e.target.value })}
                  placeholder="z. B. Max Mustermann"
                />
                <div className="mt-2 text-xs text-slate-500">Nur für Text-/Eingabefelder.</div>
              </div>

              {showVariant ? (
                <VariantSelect
                  value={variant}
                  disabled={disabled}
                  onChange={(v) => patchConfig({ variant: v })}
                />
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {showOptions ? (
                <OptionsEditor
                  options={opts}
                  disabled={disabled}
                  onChange={(next) => patchConfig({ options: next })}
                />
              ) : null}

              {showRating ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-sm font-medium text-slate-900">Bewertung</div>
                  <div className="mt-1 text-xs text-slate-500">Anzahl Sterne.</div>

                  <div className="mt-3">
                    <Label>Sterne (Max)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={String((field.config?.ratingMax ?? 5) as number)}
                      disabled={disabled}
                      onChange={(e) => {
                        const n = Math.max(1, Math.min(10, Number(e.target.value || 5)));
                        patchConfig({ ratingMax: n });
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {showVariant && variant === "attachment" ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-sm font-medium text-slate-900">Dokument / Foto</div>
                  <div className="mt-1 text-xs text-slate-500">App: Datei auswählen oder Foto aufnehmen.</div>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <Label>Max. Dateien</Label>
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        value={String(field.config?.attachment?.maxFiles ?? 1)}
                        disabled={disabled}
                        onChange={(e) => {
                          const n = Math.max(1, Math.min(5, Number(e.target.value || 1)));
                          patchConfig({ attachment: { ...(field.config?.attachment ?? {}), maxFiles: n } });
                        }}
                      />
                    </div>

                    <div>
                      <Label>Akzeptiert</Label>
                      <Input
                        value={(field.config?.attachment?.accept ?? ["image/*", "application/pdf"]).join(", ")}
                        disabled={disabled}
                        onChange={(e) => {
                          const parts = e.target.value
                            .split(",")
                            .map((x) => x.trim())
                            .filter(Boolean);
                          patchConfig({ attachment: { ...(field.config?.attachment ?? {}), accept: parts } });
                        }}
                        placeholder='image/*, application/pdf'
                      />
                      <div className="mt-2 text-xs text-slate-500">Komma-separiert (MIME-Typen oder Wildcards).</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {showVariant && variant === "audio" ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-sm font-medium text-slate-900">Audio</div>
                  <div className="mt-1 text-xs text-slate-500">App: Sprachnotiz aufnehmen oder Audiodatei auswählen.</div>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Toggle
                      checked={field.config?.audio?.allowRecord ?? true}
                      disabled={disabled}
                      onChange={(v) =>
                        patchConfig({ audio: { ...(field.config?.audio ?? {}), allowRecord: v } })
                      }
                      label="Aufnehmen erlauben"
                      hint="Mikrofonaufnahme (Sprachnotiz)."
                    />

                    <Toggle
                      checked={field.config?.audio?.allowPick ?? true}
                      disabled={disabled}
                      onChange={(v) =>
                        patchConfig({ audio: { ...(field.config?.audio ?? {}), allowPick: v } })
                      }
                      label="Datei auswählen erlauben"
                      hint="Audio aus Dateien/Share-Sheet."
                    />
                  </div>

                  <div className="mt-3">
                    <Label>Max. Dauer (Sekunden)</Label>
                    <Input
                      type="number"
                      min={5}
                      max={600}
                      value={String(field.config?.audio?.maxDurationSec ?? 60)}
                      disabled={disabled}
                      onChange={(e) => {
                        const n = Math.max(5, Math.min(600, Number(e.target.value || 60)));
                        patchConfig({ audio: { ...(field.config?.audio ?? {}), maxDurationSec: n } });
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4">
            <div className="text-xs text-slate-500">
              Änderungen werden automatisch gespeichert.
            </div>
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
              onClick={onClose}
            >
              Fertig
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
