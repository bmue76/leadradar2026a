"use client";

import * as React from "react";
import type { FormField } from "../../formDetail.types";
import { buildConfigForDraft, parseCheckboxDefault, parseOptions, TYPE_OPTIONS } from "../../_lib/fieldConfig";

export type DraftState = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  isActive: boolean;
  placeholder: string;
  helpText: string;
  optionsText: string;
  checkboxDefault: boolean;
  config: unknown; // normalized object|null
};

type InlineError = { message: string; code?: string; traceId?: string } | null;

export default function InspectorPane({
  field,
  draft,
  setDraft,
  saving,
  saveError,
  onSave,
  onRefresh,
}: {
  field: FormField | null;
  draft: DraftState | null;
  setDraft: (d: DraftState | null) => void;
  saving: boolean;
  saveError: InlineError;
  onSave: (d: DraftState) => void;
  onRefresh: () => void;
}) {
  // Whenever draft gets set from parent, populate options/default from field.config
  React.useEffect(() => {
    if (!field || !draft) return;

    const t = String(field.type || "").toUpperCase();
    const options = parseOptions(field.config);
    const checkboxDefault = parseCheckboxDefault(field.config);

    // only set if empty/uninitialized, to avoid overwriting user's typing
    setDraft({
      ...draft,
      type: t,
      optionsText: draft.optionsText.trim().length ? draft.optionsText : options.join("\n"),
      checkboxDefault: draft.checkboxDefault || checkboxDefault,
      config: field.config ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field?.id]);

  function update(partial: Partial<DraftState>) {
    if (!draft) return;
    setDraft({ ...draft, ...partial });
  }

  if (!field || !draft) {
    return (
      <div className="rounded-2xl border bg-white p-5">
        <div className="mb-3">
          <div className="text-sm font-semibold text-gray-900">Properties</div>
          <div className="text-xs text-gray-500">Select a field to edit.</div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>
    );
  }

  const type = draft.type.toUpperCase();

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">Properties</div>
          <div className="text-xs text-gray-500">Edit field settings and save.</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
            disabled={saving}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              const cfg = buildConfigForDraft(type, {
                optionsText: draft.optionsText,
                checkboxDefault: draft.checkboxDefault,
              });
              onSave({ ...draft, type, config: cfg ?? null });
            }}
            className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-black/90 disabled:opacity-60"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {saveError ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-medium">{saveError.message}</div>
          <div className="mt-1 text-xs text-red-700/80">
            {saveError.code ? `Code: ${saveError.code} · ` : null}
            {saveError.traceId ? `traceId: ${saveError.traceId}` : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-900">Label</label>
          <input
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            value={draft.label}
            onChange={(e) => update({ label: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900">Key</label>
          <input
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono"
            value={draft.key}
            onChange={(e) => update({ key: e.target.value })}
          />
          <div className="mt-1 text-xs text-gray-500">Must be unique per form.</div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900">Type</label>
          <select
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            value={draft.type}
            onChange={(e) => {
              const nextType = e.target.value.toUpperCase();

              const nextDraft: DraftState = {
                ...draft,
                type: nextType,
              };

              if ((nextType === "SINGLE_SELECT" || nextType === "MULTI_SELECT") && !draft.optionsText.trim()) {
                nextDraft.optionsText = "Option 1\nOption 2";
              }

              if (nextType === "CHECKBOX") {
                nextDraft.checkboxDefault = Boolean(draft.checkboxDefault);
              }

              setDraft(nextDraft);
            }}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {(type === "SINGLE_SELECT" || type === "MULTI_SELECT") ? (
          <div>
            <label className="block text-sm font-medium text-gray-900">Options</label>
            <textarea
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono"
              rows={6}
              placeholder="One option per line"
              value={draft.optionsText}
              onChange={(e) => update({ optionsText: e.target.value })}
            />
            <div className="mt-1 text-xs text-gray-500">One option per line.</div>
          </div>
        ) : null}

        {type === "CHECKBOX" ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <label className="flex items-center gap-2 text-sm text-gray-900">
              <input
                type="checkbox"
                checked={draft.checkboxDefault}
                onChange={(e) => update({ checkboxDefault: e.target.checked })}
              />
              Default checked
            </label>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={draft.required}
              onChange={(e) => update({ required: e.target.checked })}
            />
            Required
          </label>

          <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => update({ isActive: e.target.checked })}
            />
            Active
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900">Placeholder</label>
          <input
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            value={draft.placeholder}
            onChange={(e) => update({ placeholder: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900">Help text</label>
          <textarea
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            rows={3}
            value={draft.helpText}
            onChange={(e) => update({ helpText: e.target.value })}
          />
        </div>

        <div className="text-xs text-gray-400">
          Saving updates the field via <span className="font-mono">PATCH /api/admin/v1/forms/:id/fields/:fieldId</span>.
        </div>
      </div>
    </div>
  );
}
