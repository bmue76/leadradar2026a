"use client";

import { useMemo, useState } from "react";
import type { FormListItem } from "./exports.types";

export type ExportCreateValues = {
  formId?: string;
  includeDeleted: boolean;
  from?: string;
  to?: string;
};

export function ExportCreateModal(props: {
  forms: FormListItem[];
  busy?: boolean;
  onClose: () => void;
  onSubmit: (values: ExportCreateValues) => Promise<void>;
}) {
  const [formId, setFormId] = useState<string>("");
  const [includeDeleted, setIncludeDeleted] = useState<boolean>(false);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const formOptions = useMemo(() => {
    const items = [...props.forms];
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }, [props.forms]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !props.busy) props.onClose();
      }}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          if (!props.busy) props.onClose();
        }}
      />

      {/* Panel */}
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl border border-neutral-200">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Create CSV Export</h2>
              <p className="text-sm text-neutral-500 mt-1">
                Scope: Leads (stable columns + values_json). Delimiter: <span className="font-medium">;</span>
              </p>
            </div>
            <button
              className="rounded-xl px-3 py-2 text-sm bg-neutral-100 hover:bg-neutral-200 disabled:opacity-50"
              onClick={props.onClose}
              disabled={props.busy}
            >
              Close
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium">Form (optional)</label>
              <select
                className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                disabled={props.busy}
              >
                <option value="">All forms</option>
                {formOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium">From (optional)</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  disabled={props.busy}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">To (optional)</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  disabled={props.busy}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded border-neutral-300"
                checked={includeDeleted}
                onChange={(e) => setIncludeDeleted(e.target.checked)}
                disabled={props.busy}
              />
              Include deleted leads
            </label>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              className="rounded-xl px-4 py-2 text-sm bg-neutral-100 hover:bg-neutral-200 disabled:opacity-50"
              onClick={props.onClose}
              disabled={props.busy}
            >
              Cancel
            </button>
            <button
              className="rounded-xl px-4 py-2 text-sm bg-black text-white hover:bg-black/90 disabled:bg-black/40"
              disabled={props.busy}
              onClick={async () => {
                await props.onSubmit({
                  formId: formId || undefined,
                  includeDeleted,
                  from: from || undefined,
                  to: to || undefined,
                });
              }}
            >
              {props.busy ? "Creating..." : "Create Export"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
