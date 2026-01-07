"use client";

import * as React from "react";
import { FIELD_TYPES, type FieldType } from "../../../_lib/builderV2.types";

export default function AddFieldModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (type: FieldType) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-xl rounded-2xl border bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Add a field</div>
            <div className="mt-1 text-sm text-gray-500">Choose a field type to add to your form.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50">
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {FIELD_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => onCreate(t.type)}
              className="rounded-xl border p-4 text-left hover:bg-gray-50"
            >
              <div className="text-sm font-semibold">{t.label}</div>
              <div className="mt-1 text-xs text-gray-500">{t.hint}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
