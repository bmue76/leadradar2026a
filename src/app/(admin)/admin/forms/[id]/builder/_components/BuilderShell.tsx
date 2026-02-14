"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import FieldLibrary, { buildPackItems, LIB_ITEMS } from "./FieldLibrary";
import Canvas, { DropIndicator } from "./Canvas";
import MobilePreview from "./MobilePreview";
import SaveTemplateModal from "./SaveTemplateModal";

import type {
  BuilderField,
  BuilderForm,
  BuilderGetPayload,
  FieldSection,
  LibraryItem,
  LibraryTab,
  QuickPackId,
} from "../builder.types";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeJsonParse<T>(txt: string): T | null {
  try {
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

function sectionOfField(f: BuilderField): FieldSection {
  return (f.config?.section ?? "FORM") as FieldSection;
}

function uniqueKey(base: string, used: Set<string>): string {
  const clean = base.replace(/[^a-zA-Z0-9_]/g, "_") || "field";
  if (!used.has(clean)) return clean;
  let i = 2;
  while (used.has(`${clean}_${i}`)) i++;
  return `${clean}_${i}`;
}

function shouldAutoOpenSettings(item: LibraryItem): boolean {
  if (item.kind === "contact") return false;

  const variant = (item.defaultConfig as any)?.variant;
  if (
    variant === "attachment" ||
    variant === "audio" ||
    variant === "rating" ||
    variant === "date" ||
    variant === "datetime"
  )
    return true;

  if (String((item as any).type) === "SINGLE_SELECT" || String((item as any).type) === "MULTI_SELECT") return true;
  if (variant === "consent" || variant === "yesNo") return true;
  return false;
}

/* ----------------------------- UI helpers ----------------------------- */

function Toast(props: { kind: "error" | "success"; message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[60] w-full max-w-md">
      <div
        className={cx(
          "rounded-2xl border bg-white p-4 shadow-2xl",
          props.kind === "error" ? "border-rose-200" : "border-emerald-200"
        )}
        role="status"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={cx("text-sm font-semibold", props.kind === "error" ? "text-rose-900" : "text-emerald-900")}>
              {props.kind === "error" ? "Fehler" : "OK"}
            </div>
            <div className={cx("mt-1 text-sm", props.kind === "error" ? "text-rose-800" : "text-emerald-800")}>
              {props.message}
            </div>
          </div>
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={props.onClose}
          >
            Schliessen
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog(props: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[55]">
      <button type="button" className="absolute inset-0 bg-black/25" aria-label="Schliessen" onClick={props.onCancel} />
      <div className="absolute left-1/2 top-1/2 w-[94vw] max-w-lg -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 px-6 py-4">
            <div className="text-sm font-semibold text-slate-900">{props.title}</div>
            {props.description ? <div className="mt-1 text-sm text-slate-600">{props.description}</div> : null}
          </div>
          <div className="flex items-center justify-end gap-2 px-6 py-4">
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={props.onCancel}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className={cx(
                "rounded-xl border px-3 py-2 text-sm font-semibold",
                props.danger
                  ? "border-rose-200 bg-rose-600 text-white hover:bg-rose-700"
                  : "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
              )}
              onClick={props.onConfirm}
            >
              {props.confirmLabel ?? "Bestätigen"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DragCard(props: { title: string; subtitle?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl">
      <div className="text-sm font-semibold text-slate-900">{props.title}</div>
      {props.subtitle ? <div className="text-xs text-slate-500">{props.subtitle}</div> : null}
    </div>
  );
}

/* -------------------------- Field settings drawer -------------------------- */

function FieldSettingsDrawer(props: {
  open: boolean;
  field: BuilderField | null;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<BuilderField>) => void;
  onMoveSection: (id: string, section: FieldSection) => void;
}) {
  const f = props.field;
  const [local, setLocal] = useState<BuilderField | null>(f);

  useEffect(() => {
    setLocal(f);
  }, [f?.id]);

  const optionsText = useMemo(() => {
    const opts = Array.isArray(local?.config?.options) ? (local?.config?.options as unknown[]) : [];
    return (opts ?? []).map((x) => String(x)).join("\n");
  }, [local?.config?.options]);

  if (!props.open || !local) return null;

  const variant = (local.config?.variant ?? undefined) as string | undefined;
  const type = String((local as any).type ?? "");

  const commit = () => {
    props.onPatch(local.id, {
      label: local.label,
      required: local.required,
      placeholder: local.placeholder,
      helpText: local.helpText,
      config: local.config,
    } as Partial<BuilderField>);
  };

  const setConfig = (patch: Record<string, unknown>) => {
    const next = { ...(local.config ?? {}), ...patch };
    setLocal({ ...local, config: next });
  };

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/20" aria-label="Schliessen" onClick={props.onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[520px] bg-white shadow-2xl">
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-6">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">Feld-Einstellungen</div>
            <div className="truncate font-mono text-xs text-slate-500">{local.key}</div>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
            onClick={() => {
              commit();
              props.onClose();
            }}
          >
            Fertig
          </button>
        </div>

        <div className="h-[calc(100%-3.5rem)] space-y-5 overflow-auto px-6 py-6">
          <div className="grid grid-cols-1 gap-3">
            <label className="text-xs font-semibold text-slate-600">Label</label>
            <input
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              value={local.label}
              onChange={(e) => setLocal({ ...local, label: e.target.value })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={local.required}
                onChange={(e) => setLocal({ ...local, required: e.target.checked })}
              />
              Pflichtfeld
            </label>

            <button
              type="button"
              className="ml-auto inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => props.onMoveSection(local.id, sectionOfField(local) === "FORM" ? "CONTACT" : "FORM")}
              title="Zwischen Screen 1 und Screen 2 verschieben"
            >
              ⇄ Screen wechseln
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <label className="text-xs font-semibold text-slate-600">Placeholder (optional)</label>
            <input
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              value={local.placeholder ?? ""}
              onChange={(e) => setLocal({ ...local, placeholder: e.target.value || null })}
            />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <label className="text-xs font-semibold text-slate-600">Hilfetext (optional)</label>
            <textarea
              className="min-h-[80px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={local.helpText ?? ""}
              onChange={(e) => setLocal({ ...local, helpText: e.target.value || null })}
            />
          </div>

          {type === "SINGLE_SELECT" || type === "MULTI_SELECT" || variant === "yesNo" ? (
            <div className="grid grid-cols-1 gap-3">
              <label className="text-xs font-semibold text-slate-600">Optionen (eine pro Zeile)</label>
              <textarea
                className="min-h-[120px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
                value={optionsText}
                onChange={(e) => {
                  const lines = e.target.value
                    .split(/\r?\n/g)
                    .map((s) => s.trim())
                    .filter(Boolean);
                  setConfig({ options: lines.length ? lines : ["Option 1"] });
                }}
              />
            </div>
          ) : null}

          {variant === "rating" ? (
            <div className="grid grid-cols-1 gap-3">
              <label className="text-xs font-semibold text-slate-600">Max. Sterne</label>
              <input
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                type="number"
                min={3}
                max={10}
                value={Number((local.config as any)?.ratingMax ?? 5)}
                onChange={(e) => setConfig({ ratingMax: Number(e.target.value) || 5 })}
              />
            </div>
          ) : null}

          {variant === "attachment" ? (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-600">Anhang</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500">maxFiles</div>
                  <input
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    type="number"
                    min={1}
                    max={5}
                    value={Number(((local.config as any)?.attachment as any)?.maxFiles ?? 1)}
                    onChange={(e) =>
                      setConfig({
                        attachment: {
                          ...(((local.config as any)?.attachment as any) ?? {}),
                          maxFiles: Number(e.target.value) || 1,
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-500">accept (CSV)</div>
                  <input
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    value={String(
                      ((((local.config as any)?.attachment as any)?.accept ?? ["image/*", "application/pdf"]) as any[]).join(",")
                    )}
                    onChange={(e) => {
                      const list = e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);
                      setConfig({
                        attachment: { ...(((local.config as any)?.attachment as any) ?? {}), accept: list.length ? list : ["image/*"] },
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {variant === "audio" ? (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-600">Audio / Sprachnotiz</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500">maxDurationSec</div>
                  <input
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    type="number"
                    min={10}
                    max={600}
                    value={Number(((local.config as any)?.audio as any)?.maxDurationSec ?? 60)}
                    onChange={(e) =>
                      setConfig({
                        audio: { ...(((local.config as any)?.audio as any) ?? {}), maxDurationSec: Number(e.target.value) || 60 },
                      })
                    }
                  />
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={Boolean(((local.config as any)?.audio as any)?.allowRecord ?? true)}
                      onChange={(e) =>
                        setConfig({ audio: { ...(((local.config as any)?.audio as any) ?? {}), allowRecord: e.target.checked } })
                      }
                    />
                    aufnehmen
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={Boolean(((local.config as any)?.audio as any)?.allowPick ?? true)}
                      onChange={(e) =>
                        setConfig({ audio: { ...(((local.config as any)?.audio as any) ?? {}), allowPick: e.target.checked } })
                      }
                    />
                    wählen
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Hinweis: Screen 2 (Kontakt) wird in der App über Erfassungsarten (Visitenkarte / QR / Kontakte / Manuell) befüllt.
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ---------------------------- Form settings modal ---------------------------- */

type CaptureStart = "FORM_FIRST" | "CONTACT_FIRST";

type SettingsDraft = {
  name: string;
  description: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  captureStart: CaptureStart;
};

function getCaptureStartFromForm(form: BuilderForm): CaptureStart {
  const cfg = form.config;
  if (isRecord(cfg) && (cfg as any).captureStart === "CONTACT_FIRST") return "CONTACT_FIRST";
  return "FORM_FIRST";
}

function mergeFormConfig(form: BuilderForm, patch: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = isRecord(form.config) ? { ...(form.config as Record<string, unknown>) } : {};
  return { ...base, ...patch };
}

type PresetFieldSnapshot = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  placeholder: string | null;
  helpText: string | null;
  isActive: boolean;
  config: Record<string, unknown>;
};

type PresetConfigV1 = {
  v: 1;
  source: "FORM_BUILDER";
  captureStart: CaptureStart;
  formConfig: Record<string, unknown>;
  fields: PresetFieldSnapshot[];
};

function buildPresetConfigV1(form: BuilderForm, fields: BuilderField[]): PresetConfigV1 {
  const formConfig = isRecord(form.config) ? { ...(form.config as Record<string, unknown>) } : {};
  const sorted = fields.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  const snapFields: PresetFieldSnapshot[] = sorted.map((f) => ({
    key: String(f.key),
    label: String(f.label ?? ""),
    type: String((f as unknown as { type?: unknown }).type ?? ""),
    required: Boolean(f.required),
    placeholder: (f.placeholder ?? null) as string | null,
    helpText: (f.helpText ?? null) as string | null,
    isActive: Boolean(f.isActive),
    config: isRecord(f.config) ? ({ ...(f.config as Record<string, unknown>) } as Record<string, unknown>) : {},
  }));

  return {
    v: 1,
    source: "FORM_BUILDER",
    captureStart: getCaptureStartFromForm(form),
    formConfig,
    fields: snapFields,
  };
}

function SettingsModal(props: {
  open: boolean;
  form: BuilderForm;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: SettingsDraft) => void;
}) {
  const [draft, setDraft] = useState<SettingsDraft>({
    name: props.form.name ?? "",
    description: props.form.description ?? "",
    status: props.form.status as any,
    captureStart: getCaptureStartFromForm(props.form),
  });

  useEffect(() => {
    if (!props.open) return;
    setDraft({
      name: props.form.name ?? "",
      description: props.form.description ?? "",
      status: props.form.status as any,
      captureStart: getCaptureStartFromForm(props.form),
    });
  }, [props.open, props.form.id, props.form.updatedAt, props.form.name, props.form.description, props.form.status]);

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[52]">
      <button type="button" className="absolute inset-0 bg-black/25" aria-label="Schliessen" onClick={props.onClose} />
      <aside className="absolute left-1/2 top-1/2 h-[86vh] w-[94vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-6">
          <div className="text-sm font-semibold text-slate-900">Formular-Einstellungen</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={props.onClose}
              disabled={props.saving}
            >
              Schliessen
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              onClick={() => props.onSave(draft)}
              disabled={props.saving}
            >
              {props.saving ? "Speichern…" : "Speichern"}
            </button>
          </div>
        </div>

        <div className="h-[calc(86vh-3.5rem)] overflow-auto px-6 py-6">
          <div className="grid grid-cols-1 gap-6">
            <div className="grid grid-cols-1 gap-2">
              <label className="text-xs font-semibold text-slate-600">Name</label>
              <input
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
              <div className="text-xs text-slate-500">Wird in Admin & App angezeigt.</div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <label className="text-xs font-semibold text-slate-600">Beschreibung (optional)</label>
              <textarea
                className="min-h-[90px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
              <div className="text-xs text-slate-500">Kurzer Hinweis für den Erfassenden / Kontext fürs Formular.</div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <label className="text-xs font-semibold text-slate-600">Status</label>
              <select
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                value={draft.status}
                onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as any }))}
              >
                <option value="DRAFT">Entwurf</option>
                <option value="ACTIVE">Aktiv</option>
                <option value="ARCHIVED">Archiviert</option>
              </select>
              <div className="text-xs text-slate-500">Nur aktive Formulare sollen später in der App auswählbar sein.</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-700">App Ablauf</div>
              <div className="mt-1 text-xs text-slate-600">
                Du kannst steuern, ob die Erfassung in der App mit Formularfeldern oder mit Kontaktfeldern startet.
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2">
                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                  <input
                    type="radio"
                    className="mt-1 h-4 w-4"
                    name="captureStart"
                    checked={draft.captureStart === "FORM_FIRST"}
                    onChange={() => setDraft((d) => ({ ...d, captureStart: "FORM_FIRST" }))}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">Formular zuerst</div>
                    <div className="text-xs text-slate-500">
                      Screen 1: Formularfelder → Button „Kontakt erfassen“ → Screen 2: Kontaktfelder
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                  <input
                    type="radio"
                    className="mt-1 h-4 w-4"
                    name="captureStart"
                    checked={draft.captureStart === "CONTACT_FIRST"}
                    onChange={() => setDraft((d) => ({ ...d, captureStart: "CONTACT_FIRST" }))}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">Kontakt zuerst</div>
                    <div className="text-xs text-slate-500">
                      Screen 1: Kontaktfelder → Button „Formular erfassen“ → Screen 2: Formularfelder
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold text-slate-700">Hinweis</div>
              <div className="mt-1 text-xs text-slate-600">
                Weitere Settings (z.B. Pflicht-Kontaktblock, Lead-Status Defaults, Vorlagen-Metadaten, etc.) ergänzen wir später – zuerst GoLive-MVP clean halten.
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* --------------------------------- Builder --------------------------------- */

export default function BuilderShell(props: { formId: string; mode?: "edit" | "preview" }) {
  const mode = props.mode ?? "edit";
  const readOnly = mode === "preview";

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<BuilderForm | null>(null);
  const [fields, setFields] = useState<BuilderField[]>([]);
  const fieldsRef = useRef<BuilderField[]>([]);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  const [tab, setTab] = useState<LibraryTab>("FORM");
  const [openFieldId, setOpenFieldId] = useState<string | null>(null);

  const [dropIndicator, setDropIndicator] = useState<DropIndicator>(null);
  const [draggingKind, setDraggingKind] = useState<null | "LIB" | "FIELD">(null);
  const [dragOverlay, setDragOverlay] = useState<null | { title: string; subtitle?: string }>(null);

  const [autoOpen, setAutoOpen] = useState<boolean>(true);

  // Canvas active screen (must stay in sync with FieldLibrary tab)
  const [activeSection, setActiveSection] = useState<FieldSection>("FORM");

  // sync helpers (tab ⇄ canvas)
  const handleTabChange = useCallback((next: LibraryTab) => {
    setTab(next);
    setActiveSection(next === "CONTACT" ? "CONTACT" : "FORM");
  }, []);

  const handleSwitchSection = useCallback(
    (next: FieldSection) => {
      setActiveSection(next);
      if (!readOnly) setTab(next);
    },
    [readOnly]
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateBusy, setSaveTemplateBusy] = useState(false);

  const [toast, setToast] = useState<null | { kind: "error" | "success"; message: string }>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const existingKeys = useMemo(() => new Set(fields.map((f) => f.key)), [fields]);

  useEffect(() => {
    const raw = localStorage.getItem("lr_builder:autoOpenSettings");
    if (raw === "0") setAutoOpen(false);
    if (raw === "1") setAutoOpen(true);
  }, []);

  const setAutoOpenPersist = (v: boolean) => {
    setAutoOpen(v);
    localStorage.setItem("lr_builder:autoOpenSettings", v ? "1" : "0");
  };

  const patchBuilder = useCallback(
    async (body: unknown): Promise<ApiResp<any> | null> => {
      try {
        const res = await fetch(`/api/admin/v1/forms/${props.formId}/builder`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const txt = await res.text();
        const json = safeJsonParse<ApiResp<any>>(txt);
        return json ?? null;
      } catch {
        return null;
      }
    },
    [props.formId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/v1/forms/${props.formId}/builder`, { method: "GET", cache: "no-store" });
      const txt = await res.text();
      const json = safeJsonParse<ApiResp<BuilderGetPayload>>(txt);

      if (!json || typeof json !== "object") {
        setError("Ungültige Serverantwort (non-JSON).");
        setLoading(false);
        return;
      }
      if (!json.ok) {
        setError(json.error?.message || "Formular nicht gefunden.");
        setLoading(false);
        return;
      }

      const inFields = Array.isArray((json.data as any).fields) ? ((json.data as any).fields as BuilderField[]) : [];
      const normalized = inFields.map((f) => {
        const cfg = (f.config ?? {}) as any;
        const sec = cfg.section === "CONTACT" || cfg.section === "FORM" ? cfg.section : undefined;

        const contactKeys = new Set([
          "firstName",
          "lastName",
          "company",
          "email",
          "phone",
          "address",
          "zip",
          "city",
          "country",
          "website",
        ]);
        const fixed = contactKeys.has(f.key) ? "CONTACT" : "FORM";

        const nextCfg = { ...(isRecord(cfg) ? cfg : {}), section: (sec ?? fixed) as FieldSection };
        return { ...f, config: nextCfg };
      });

      setForm((json.data as any).form as BuilderForm);
      setFields(normalized.sort((a, b) => a.sortOrder - b.sortOrder));

      // keep tab/section valid after reload
      setActiveSection((cur) => (cur === "CONTACT" ? "CONTACT" : "FORM"));
      setTab((cur) => (cur === "CONTACT" ? "CONTACT" : "FORM"));

      setLoading(false);
    } catch {
      setError("Konnte Formular nicht laden.");
      setLoading(false);
    }
  }, [props.formId]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistReorder = useCallback(
    async (nextFields: BuilderField[]) => {
      const order = nextFields.map((f) => f.id);
      const json = await patchBuilder({ op: "REORDER", order });
      if (!json || !json.ok) {
        setToast({ kind: "error", message: (json as any)?.error?.message || "Reihenfolge konnte nicht gespeichert werden." });
        return false;
      }
      return true;
    },
    [patchBuilder]
  );

  const onPatchField = useCallback(
    async (id: string, patch: Partial<BuilderField>) => {
      const json = await patchBuilder({ op: "PATCH_FIELD", fieldId: id, patch });
      if (!json || !json.ok) {
        setToast({ kind: "error", message: (json as any)?.error?.message || "Änderung fehlgeschlagen." });
        return;
      }
      await load();
    },
    [patchBuilder, load]
  );

  const onDuplicateField = useCallback(
    async (id: string) => {
      const json = await patchBuilder({ op: "DUPLICATE_FIELD", fieldId: id });
      if (!json || !json.ok) {
        setToast({ kind: "error", message: (json as any)?.error?.message || "Duplizieren fehlgeschlagen." });
        return;
      }
      await load();
    },
    [patchBuilder, load]
  );

  const doDeleteField = useCallback(
    async (id: string) => {
      const json = await patchBuilder({ op: "DELETE_FIELD", fieldId: id });
      if (!json || !json.ok) {
        setToast({ kind: "error", message: (json as any)?.error?.message || "Löschen fehlgeschlagen." });
        return;
      }
      setOpenFieldId((cur) => (cur === id ? null : cur));
      await load();
      setToast({ kind: "success", message: "Feld gelöscht." });
    },
    [patchBuilder, load]
  );

  const onDeleteField = useCallback(async (id: string) => {
    setConfirmDeleteId(id);
  }, []);

  const moveFieldToSection = useCallback(
    async (id: string, section: FieldSection) => {
      const f = fieldsRef.current.find((x) => x.id === id);
      if (!f) return;
      const cfg = { ...(f.config ?? {}), section };
      await onPatchField(id, { config: cfg } as any);
    },
    [onPatchField]
  );

  const addFieldFromLibrary = useCallback(
    async (item: LibraryItem, section: FieldSection, index: number, snapshot?: BuilderField[]) => {
      if (readOnly) return snapshot ?? fieldsRef.current;

      const base = snapshot ?? fieldsRef.current;

      if (item.kind === "contact") {
        const existing = base.find((f) => f.key === item.key);
        if (existing) {
          handleSwitchSection("CONTACT");
          setOpenFieldId(existing.id);
          return base;
        }
      }

      const used = new Set(base.map((f) => f.key));
      const key = item.kind === "contact" ? item.key : uniqueKey(item.keyBase ?? "field", used);

      const payload = {
        key,
        label: item.defaultLabel,
        type: item.type,
        required: false,
        isActive: true,
        placeholder: item.defaultPlaceholder ?? null,
        helpText: item.defaultHelpText ?? null,
        config: { ...(item.defaultConfig ?? {}), section } as any,
      };

      const res = await fetch(`/api/admin/v1/forms/${props.formId}/fields`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const txt = await res.text();
      const json = safeJsonParse<ApiResp<any>>(txt);

      if (!json || typeof json !== "object") {
        setToast({ kind: "error", message: "Ungültige Serverantwort (non-JSON)." });
        return base;
      }
      if (!json.ok) {
        setToast({ kind: "error", message: json.error?.message || "Feld konnte nicht erstellt werden." });
        return base;
      }

      const created: BuilderField = json.data as BuilderField;

      const withCfg: BuilderField = {
        ...created,
        config: { ...(created.config ?? {}), section } as any,
      };

      const formList = base.filter((f) => sectionOfField(f) === "FORM");
      const contactList = base.filter((f) => sectionOfField(f) === "CONTACT");

      const target = section === "FORM" ? formList : contactList;
      const other = section === "FORM" ? contactList : formList;

      const safeIndex = Math.max(0, Math.min(index, target.length));
      const nextTarget = target.slice();
      nextTarget.splice(safeIndex, 0, withCfg);

      const nextAll = section === "FORM" ? [...nextTarget, ...other] : [...other, ...nextTarget];

      setFields(nextAll);
      await persistReorder(nextAll);

      handleSwitchSection(section);

      if (autoOpen && shouldAutoOpenSettings(item)) {
        setOpenFieldId(withCfg.id);
      }

      return nextAll;
    },
    [autoOpen, handleSwitchSection, persistReorder, props.formId, readOnly]
  );

  const addPack = useCallback(
    async (pack: QuickPackId) => {
      if (readOnly) return;
      const keys = buildPackItems(pack);

      const mapKeyToLib = (k: string) =>
        LIB_ITEMS.find((x) => x.kind === "contact" && (x as any).key === k) as LibraryItem | undefined;

      let cur = fieldsRef.current;

      const contactExisting = new Set(cur.map((f) => f.key));
      const missing = keys.filter((k) => !contactExisting.has(k));

      const contactCount = cur.filter((f) => sectionOfField(f) === "CONTACT").length;
      let insertAt = contactCount;

      for (const k of missing) {
        const it = mapKeyToLib(k);
        if (!it) continue;
        cur = await addFieldFromLibrary(it, "CONTACT", insertAt, cur);
        insertAt += 1;
      }

      handleTabChange("CONTACT");
    },
    [addFieldFromLibrary, handleTabChange, readOnly]
  );

  const onAddItem = useCallback(
    async (item: LibraryItem) => {
      const targetSection: FieldSection =
        item.kind === "contact" ? "CONTACT" : ((item.defaultConfig?.section ?? "FORM") as FieldSection);

      handleTabChange(targetSection);

      const cur = fieldsRef.current;
      const currentList = cur.filter((f) => sectionOfField(f) === targetSection);
      await addFieldFromLibrary(item, targetSection, currentList.length, cur);
    },
    [addFieldFromLibrary, handleTabChange]
  );

  const computeDropFromEvent = useCallback((e: DragOverEvent | DragEndEvent): DropIndicator => {
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return null;

    const cur = fieldsRef.current;

    if (overId === "canvas:FORM") {
      const n = cur.filter((f) => sectionOfField(f) === "FORM").length;
      return { section: "FORM", index: n };
    }
    if (overId === "canvas:CONTACT") {
      const n = cur.filter((f) => sectionOfField(f) === "CONTACT").length;
      return { section: "CONTACT", index: n };
    }

    const overField = cur.find((f) => f.id === overId);
    if (!overField) return null;

    const sec = sectionOfField(overField);
    const list = cur.filter((f) => sectionOfField(f) === sec);
    const idx = list.findIndex((x) => x.id === overField.id);
    if (idx < 0) return null;

    const overRect = (e.over as any)?.rect as { top: number; height: number } | undefined;
    const activeRect = (e.active as any)?.rect?.current?.translated ?? (e.active as any)?.rect?.current?.initial;

    const activeCenterY =
      activeRect && typeof activeRect.top === "number" && typeof activeRect.height === "number"
        ? activeRect.top + activeRect.height / 2
        : null;

    const overMidY =
      overRect && typeof overRect.top === "number" && typeof overRect.height === "number"
        ? overRect.top + overRect.height / 2
        : null;

    const after = activeCenterY !== null && overMidY !== null ? activeCenterY > overMidY : false;
    return { section: sec, index: after ? idx + 1 : idx };
  }, []);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    const data = e.active.data.current as any;

    if (data?.kind === "LIB") {
      setDraggingKind("LIB");
      const it = data.item as LibraryItem;
      setDragOverlay({ title: it.title, subtitle: "Einfügen…" });
    } else {
      setDraggingKind("FIELD");
      const f = fieldsRef.current.find((x) => x.id === String(e.active.id));
      setDragOverlay(f ? { title: f.label, subtitle: "Verschieben…" } : { title: "Feld", subtitle: "Verschieben…" });
    }
  }, []);

  const handleDragOver = useCallback(
    (e: DragOverEvent) => {
      if (draggingKind !== "LIB") return;
      setDropIndicator(computeDropFromEvent(e));
    },
    [computeDropFromEvent, draggingKind]
  );

  const handleDragEnd = useCallback(
    async (e: DragEndEvent) => {
      const data = e.active.data.current as any;
      const activeId = String(e.active.id);
      const overId = e.over?.id ? String(e.over.id) : null;

      setDragOverlay(null);

      if (data?.kind === "LIB") {
        const it = data.item as LibraryItem;
        const di = computeDropFromEvent(e);
        setDropIndicator(null);
        setDraggingKind(null);

        if (!di) return;

        await addFieldFromLibrary(it, di.section, di.index, fieldsRef.current);
        handleSwitchSection(di.section);
        return;
      }

      const cur = fieldsRef.current;

      if (!overId || activeId === overId) {
        setDropIndicator(null);
        setDraggingKind(null);
        return;
      }

      const activeField = cur.find((f) => f.id === activeId);
      const overField = cur.find((f) => f.id === overId);

      if (overId === "canvas:FORM" || overId === "canvas:CONTACT") {
        if (!activeField) {
          setDraggingKind(null);
          return;
        }
        const targetSection: FieldSection = overId === "canvas:FORM" ? "FORM" : "CONTACT";
        const fromSection = sectionOfField(activeField);

        const fromList = cur.filter((f) => sectionOfField(f) === fromSection);
        const toList = cur.filter((f) => sectionOfField(f) === targetSection);

        const fromIndex = fromList.findIndex((x) => x.id === activeField.id);

        const fromListWithout = fromList.slice();
        fromListWithout.splice(fromIndex, 1);

        const toListNext = toList.slice();
        toListNext.push(activeField);

        const nextAll =
          targetSection === "FORM" ? [...toListNext, ...fromListWithout] : [...fromListWithout, ...toListNext];

        if (fromSection !== targetSection) {
          await onPatchField(activeField.id, { config: { ...(activeField.config ?? {}), section: targetSection } as any });
        }

        setFields(nextAll);
        await persistReorder(nextAll);

        handleSwitchSection(targetSection);

        setDropIndicator(null);
        setDraggingKind(null);
        return;
      }

      if (!activeField || !overField) {
        setDropIndicator(null);
        setDraggingKind(null);
        return;
      }

      const fromSection = sectionOfField(activeField);
      const toSection = sectionOfField(overField);

      const fromList = cur.filter((f) => sectionOfField(f) === fromSection);
      const toList = cur.filter((f) => sectionOfField(f) === toSection);

      const fromIndex = fromList.findIndex((x) => x.id === activeField.id);
      const overIndexInTo = toList.findIndex((x) => x.id === overField.id);

      let nextAll: BuilderField[] = [];

      if (fromSection === toSection) {
        const moved = arrayMove(fromList, fromIndex, overIndexInTo);
        nextAll =
          fromSection === "FORM"
            ? [...moved, ...cur.filter((f) => sectionOfField(f) === "CONTACT")]
            : [...cur.filter((f) => sectionOfField(f) === "FORM"), ...moved];
      } else {
        const fromWithout = fromList.slice();
        fromWithout.splice(fromIndex, 1);

        const toNext = toList.slice();
        const insertAt = Math.max(0, overIndexInTo);
        toNext.splice(insertAt, 0, activeField);

        nextAll = toSection === "FORM" ? [...toNext, ...fromWithout] : [...fromWithout, ...toNext];

        await onPatchField(activeField.id, { config: { ...(activeField.config ?? {}), section: toSection } as any });
      }

      setFields(nextAll);
      await persistReorder(nextAll);

      handleSwitchSection(toSection);

      setDropIndicator(null);
      setDraggingKind(null);
    },
    [addFieldFromLibrary, computeDropFromEvent, draggingKind, handleSwitchSection, onPatchField, persistReorder]
  );

  const currentOpenField = useMemo(() => fields.find((f) => f.id === openFieldId) ?? null, [fields, openFieldId]);

  const onSaveSettings = useCallback(
    async (draft: SettingsDraft) => {
      if (!form) return;

      const name = draft.name.trim();
      if (!name) {
        setToast({ kind: "error", message: "Bitte einen Formularnamen eingeben." });
        return;
      }

      setSettingsSaving(true);
      const nextConfig = mergeFormConfig(form, { captureStart: draft.captureStart });

      const json = await patchBuilder({
        op: "PATCH_FORM",
        patch: {
          name,
          description: draft.description?.trim() ? draft.description.trim() : null,
          status: draft.status,
          config: nextConfig,
        },
      });

      setSettingsSaving(false);

      if (!json || !json.ok) {
        setToast({ kind: "error", message: (json as any)?.error?.message || "Speichern fehlgeschlagen." });
        return;
      }

      await load();
      setToast({ kind: "success", message: "Einstellungen gespeichert." });
      setSettingsOpen(false);
    },
    [form, load, patchBuilder]
  );

  const saveAsPreset = useCallback(
    async (name: string, category?: string | null): Promise<{ ok: boolean }> => {
      if (!form) return { ok: false };

      const cat = (category ?? "").trim() || "Standard";

      const payload: Record<string, unknown> = {
        name: name.trim(),
        category: cat,
        config: buildPresetConfigV1(form, fieldsRef.current),
      };

      const desc = (form.description ?? "").trim();
      if (desc) payload.description = desc;

      setSaveTemplateBusy(true);
      try {
        const res = await fetch(`/api/admin/v1/presets`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        const txt = await res.text();
        const json = safeJsonParse<ApiResp<{ id: string }>>(txt);

        if (!json || typeof json !== "object") {
          setToast({ kind: "error", message: "Ungültige Serverantwort (non-JSON)." });
          return { ok: false };
        }

        if (!json.ok) {
          setToast({ kind: "error", message: json.error?.message || "Vorlage konnte nicht gespeichert werden." });
          return { ok: false };
        }

        setToast({ kind: "success", message: "Vorlage gespeichert." });
        return { ok: true };
      } catch {
        setToast({ kind: "error", message: "Vorlage konnte nicht gespeichert werden." });
        return { ok: false };
      } finally {
        setSaveTemplateBusy(false);
      }
    },
    [form]
  );

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="h-5 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
        <div className="text-sm font-semibold text-rose-900">Formular nicht gefunden</div>
        <div className="mt-1 text-sm text-rose-800">{error ?? "Unbekannter Fehler."}</div>
        <div className="mt-3">
          <button
            type="button"
            className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100"
            onClick={() => void load()}
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {toast ? <Toast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} /> : null}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Feld löschen?"
        description="Das Feld wird aus dem Formular entfernt. Dieser Schritt kann nicht rückgängig gemacht werden."
        confirmLabel="Löschen"
        danger
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          const id = confirmDeleteId;
          setConfirmDeleteId(null);
          if (id) void doDeleteField(id);
        }}
      />

      <SettingsModal
        open={settingsOpen}
        form={form}
        saving={settingsSaving}
        onClose={() => setSettingsOpen(false)}
        onSave={onSaveSettings}
      />

      <SaveTemplateModal
        open={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        defaultName={form?.name ?? "Vorlage"}
        onSave={saveAsPreset}
        busy={saveTemplateBusy}
      />

      {/* Header (always visible) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xl font-semibold text-slate-900">{form.name}</div>
          <div className="mt-1 text-sm text-slate-500">
            Modus: <span className="font-semibold text-slate-700">{readOnly ? "Vorschau" : "Bearbeiten"}</span>{" "}
            <span className="text-slate-300">•</span>{" "}
            Status:{" "}
            <span className="font-semibold text-slate-700">
              {form.status === "ACTIVE" ? "Aktiv" : form.status === "ARCHIVED" ? "Archiviert" : "Entwurf"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            type="button"
            onClick={() => setSettingsOpen(true)}
          >
            Einstellungen
          </button>

          <button
            className={cx(
              "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50",
              readOnly && "opacity-60 pointer-events-none"
            )}
            type="button"
            onClick={() => setSaveTemplateOpen(true)}
          >
            Als Vorlage speichern
          </button>

          <span className="mx-1 h-6 w-px bg-slate-200" />

          <a
            className={cx(
              "rounded-xl border px-3 py-2 text-sm font-semibold",
              !readOnly ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
            href={`/admin/forms/${form.id}/builder`}
          >
            Bearbeiten
          </a>
          <a
            className={cx(
              "rounded-xl border px-3 py-2 text-sm font-semibold",
              readOnly ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
            href={`/admin/forms/${form.id}/builder?mode=preview`}
          >
            Vorschau
          </a>
        </div>
      </div>

      {/* Preview-only view */}
      {readOnly ? (
        <div className="mt-4">
          <MobilePreview key={String(form.updatedAt)} formId={form.id} />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setDropIndicator(null);
            setDraggingKind(null);
            setDragOverlay(null);
          }}
        >
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
            <FieldLibrary
              tab={tab}
              onTabChange={handleTabChange}
              existingKeys={existingKeys}
              onAddItem={onAddItem}
              onAddPack={addPack}
              autoOpenSettings={autoOpen}
              onToggleAutoOpen={setAutoOpenPersist}
            />

            <div className="space-y-4">
              <Canvas
                fields={fields}
                dropIndicator={dropIndicator}
                draggingKind={draggingKind}
                activeSection={activeSection}
                onSwitchSection={handleSwitchSection}
                onOpenField={(id) => {
                  setOpenFieldId(id);
                  const f = fieldsRef.current.find((x) => x.id === id);
                  if (f) handleSwitchSection(sectionOfField(f));
                }}
                onDuplicateField={(id) => void onDuplicateField(id)}
                onDeleteField={(id) => void onDeleteField(id)}
                readOnly={false}
              />
            </div>
          </div>

          <FieldSettingsDrawer
            open={!!openFieldId}
            field={currentOpenField}
            onClose={() => setOpenFieldId(null)}
            onPatch={onPatchField}
            onMoveSection={moveFieldToSection}
          />

          <DragOverlay dropAnimation={null}>
            {dragOverlay ? <DragCard title={dragOverlay.title} subtitle={dragOverlay.subtitle} /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </>
  );
}
