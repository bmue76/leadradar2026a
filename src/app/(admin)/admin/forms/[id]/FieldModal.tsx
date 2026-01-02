"use client";

import { useMemo, useState } from "react";
import type { FieldUpsertInput, FormField } from "./formDetail.types";

type Mode = "create" | "edit";

const KEY_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function extractOptionsFromConfig(config: unknown): string[] {
  if (!isRecord(config)) return [];
  const raw = config.options;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function buildConfigWithOptions(existing: unknown, options: string[]): unknown {
  const base: UnknownRecord = isRecord(existing) ? existing : {};
  const next: UnknownRecord = { ...base };

  if (options.length) {
    next.options = options;
  } else {
    delete next.options;
  }

  return Object.keys(next).length ? next : undefined;
}

type Draft = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  isActive: boolean;
  placeholder: string;
  helpText: string;
  optionsText: string;
};

function makeDraft(mode: Mode, initial?: FormField | null): Draft {
  if (mode === "edit" && initial) {
    return {
      key: safeString(initial.key),
      label: safeString(initial.label),
      type: safeString(initial.type) || "TEXT",
      required: Boolean(initial.required),
      isActive: Boolean(initial.isActive),
      placeholder: safeString(initial.placeholder),
      helpText: safeString(initial.helpText),
      optionsText: extractOptionsFromConfig(initial.config).join("\n"),
    };
  }

  return {
    key: "",
    label: "",
    type: "TEXT",
    required: false,
    isActive: true,
    placeholder: "",
    helpText: "",
    optionsText: "",
  };
}

export default function FieldModal(props: {
  mode: Mode;
  initial?: FormField | null;
  onClose: () => void;
  onSubmit: (input: FieldUpsertInput) => Promise<void>;
  busy?: boolean;
  apiError?: { message: string; traceId?: string; code?: string } | null;
}) {
  const { mode, initial, onClose, onSubmit, busy, apiError } = props;

  const [draft, setDraft] = useState<Draft>(() => makeDraft(mode, initial));
  const [localError, setLocalError] = useState<string | null>(null);

  const typePresets = useMemo(
    () => [
      "TEXT",
      "TEXTAREA",
      "EMAIL",
      "PHONE",
      "NUMBER",
      "CHECKBOX",
      "SINGLE_SELECT",
      "MULTI_SELECT",
      "SELECT",
      "MULTISELECT",
      "DATE",
    ],
    []
  );

  const wantsOptions = useMemo(() => {
    const t = (draft.type || "").toUpperCase();
    return t.includes("SELECT");
  }, [draft.type]);

  function validate(): string | null {
    const k = draft.key.trim();
    const l = draft.label.trim();

    if (!k) return "Key is required.";
    if (k.length > 64) return "Key is too long (max 64).";
    if (!KEY_REGEX.test(k)) return "Key must match: [a-zA-Z][a-zA-Z0-9_]*";

    if (!l) return "Label is required.";
    if (l.length > 120) return "Label is too long (max 120).";

    const t = draft.type.trim();
    if (!t) return "Type is required.";

    if (wantsOptions) {
      const opts = draft.optionsText
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      if (opts.length < 1) return "Options are required for select fields (one per line).";
    }

    return null;
  }

  async function handleSubmit() {
    const err = validate();
    setLocalError(err);
    if (err) return;

    const opts = draft.optionsText
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    const cfg = wantsOptions ? buildConfigWithOptions(initial?.config, opts) : initial?.config;

    await onSubmit({
      key: draft.key.trim(),
      label: draft.label.trim(),
      type: draft.type.trim(),
      required: draft.required,
      isActive: draft.isActive,
      placeholder: draft.placeholder.trim() ? draft.placeholder.trim() : null,
      helpText: draft.helpText.trim() ? draft.helpText.trim() : null,
      config: cfg,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
          <div>
            <div className="text-lg font-semibold">
              {mode === "create" ? "Add field" : "Edit field"}
            </div>
            <div className="mt-1 text-sm text-gray-500">
              Keys should be stable. Choose a clear label for the user-facing form.
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40"
            disabled={busy}
          >
            Close
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {(localError || apiError) && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {localError ? (
                <div>{localError}</div>
              ) : (
                <div>
                  <div className="font-medium">{apiError?.message || "Something went wrong."}</div>
                  <div className="mt-1 text-xs text-red-700/80">
                    {apiError?.code ? `Code: ${apiError.code} · ` : null}
                    {apiError?.traceId ? `traceId: ${apiError.traceId}` : null}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <div className="text-sm font-medium">Key *</div>
              <input
                value={draft.key}
                onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
                placeholder="e.g. company_name"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                disabled={busy}
                maxLength={64}
              />
              <div className="mt-1 text-xs text-gray-500">Pattern: [a-zA-Z][a-zA-Z0-9_]*</div>
            </label>

            <label className="block">
              <div className="text-sm font-medium">Label *</div>
              <input
                value={draft.label}
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                placeholder="e.g. Company"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                disabled={busy}
                maxLength={120}
              />
            </label>

            <label className="block">
              <div className="text-sm font-medium">Type *</div>
              <input
                list="field-type-suggestions"
                value={draft.type}
                onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                disabled={busy}
              />
              <datalist id="field-type-suggestions">
                {typePresets.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              <div className="mt-1 text-xs text-gray-500">
                Pick from suggestions or type an allowed value.
              </div>
            </label>

            <div className="flex items-center gap-4 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.required}
                  onChange={(e) => setDraft((d) => ({ ...d, required: e.target.checked }))}
                  disabled={busy}
                />
                Required
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                  disabled={busy}
                />
                Active
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <div className="text-sm font-medium">Placeholder</div>
              <input
                value={draft.placeholder}
                onChange={(e) => setDraft((d) => ({ ...d, placeholder: e.target.value }))}
                placeholder="Optional"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                disabled={busy}
              />
            </label>

            <label className="block">
              <div className="text-sm font-medium">Help text</div>
              <input
                value={draft.helpText}
                onChange={(e) => setDraft((d) => ({ ...d, helpText: e.target.value }))}
                placeholder="Optional"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                disabled={busy}
              />
            </label>
          </div>

          {wantsOptions && (
            <label className="block">
              <div className="text-sm font-medium">Options (one per line) *</div>
              <textarea
                value={draft.optionsText}
                onChange={(e) => setDraft((d) => ({ ...d, optionsText: e.target.value }))}
                rows={6}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                placeholder={"Option A\nOption B\nOption C"}
                disabled={busy}
              />
              <div className="mt-1 text-xs text-gray-500">These will be stored as config.options[].</div>
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-40"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-black/90 disabled:opacity-40"
            disabled={busy}
          >
            {busy ? "Saving…" : mode === "create" ? "Create field" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
