"use client";

import * as React from "react";
import type { FormField } from "../../formDetail.types";
import type { FieldDraft } from "../FormWorkspace";

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "TEXT", label: "Text" },
  { value: "TEXTAREA", label: "Textarea" },
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
  { value: "SINGLE_SELECT", label: "Select (single)" },
  { value: "MULTI_SELECT", label: "Select (multi)" },
  { value: "CHECKBOX", label: "Checkbox" },
];

export default function InspectorPane(props: {
  selected: FormField | null;
  draft: FieldDraft | null;
  onDraftPatch: (patch: Partial<FieldDraft>) => void;
  saving: boolean;
  saveErr: string | null;
  saveTraceId: string | null;
  onSave: () => void;
}) {
  const d = props.draft;

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Properties</div>
          <div className="text-xs text-gray-500">Edit selected field and save.</div>
        </div>

        <button
          type="button"
          onClick={props.onSave}
          disabled={!props.selected || !d || props.saving}
          className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-black/90 disabled:opacity-60"
        >
          {props.saving ? "Saving…" : "Save"}
        </button>
      </div>

      {props.saveErr ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-medium">{props.saveErr}</div>
          {props.saveTraceId ? (
            <div className="mt-1 text-xs">traceId: <span className="font-mono">{props.saveTraceId}</span></div>
          ) : null}
        </div>
      ) : null}

      {!props.selected || !d ? (
        <div className="text-sm text-gray-600">Select a field.</div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900">Label</label>
            <input
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              value={d.label}
              onChange={(e) => props.onDraftPatch({ label: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900">Key</label>
            <input
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono"
              value={d.key}
              onChange={(e) => props.onDraftPatch({ key: e.target.value })}
            />
            <div className="mt-1 text-xs text-gray-500">Must be unique per form.</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900">Type</label>
            <select
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
              value={d.type}
              onChange={(e) => {
                const nextType = e.target.value;
                const patch: Partial<FieldDraft> = { type: nextType };

                // sane defaults when switching type
                if ((nextType === "SINGLE_SELECT" || nextType === "MULTI_SELECT") && !String(d.optionsText || "").trim()) {
                  patch.optionsText = "Option 1\nOption 2";
                }
                if (nextType === "CHECKBOX") {
                  patch.checkboxDefault = Boolean(d.checkboxDefault);
                }

                props.onDraftPatch(patch);
              }}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {(d.type === "SINGLE_SELECT" || d.type === "MULTI_SELECT") ? (
            <div>
              <label className="block text-sm font-medium text-gray-900">Options</label>
              <textarea
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono"
                rows={6}
                placeholder={"One option per line"}
                value={d.optionsText}
                onChange={(e) => props.onDraftPatch({ optionsText: e.target.value })}
              />
              <div className="mt-1 text-xs text-gray-500">One option per line.</div>
            </div>
          ) : null}

          {d.type === "CHECKBOX" ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <label className="flex items-center gap-2 text-sm text-gray-900">
                <input
                  type="checkbox"
                  checked={d.checkboxDefault}
                  onChange={(e) => props.onDraftPatch({ checkboxDefault: e.target.checked })}
                />
                Default checked
              </label>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={d.required}
                onChange={(e) => props.onDraftPatch({ required: e.target.checked })}
              />
              Required
            </label>

            <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={d.isActive}
                onChange={(e) => props.onDraftPatch({ isActive: e.target.checked })}
              />
              Active
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900">Placeholder</label>
            <input
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              value={d.placeholder}
              onChange={(e) => props.onDraftPatch({ placeholder: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900">Help text</label>
            <textarea
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              rows={3}
              value={d.helpText}
              onChange={(e) => props.onDraftPatch({ helpText: e.target.value })}
            />
          </div>

          <div className="text-xs text-gray-400">
            Saving updates via <span className="font-mono">PATCH /api/admin/v1/forms/:id/fields/:fieldId</span>.
          </div>
        </div>
      )}
    </div>
  );
}
