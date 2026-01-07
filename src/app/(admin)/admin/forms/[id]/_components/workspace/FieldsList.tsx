"use client";

import * as React from "react";
import type { FormField } from "../../formDetail.types";
import { typeLabel } from "../../_lib/fieldConfig";

export default function FieldsList({
  fields,
  selectedId,
  onSelect,
  onAdd,
}: {
  fields: FormField[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-2xl border bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Fields</div>
          <div className="text-xs text-gray-500">{fields.length} field(s)</div>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Add
        </button>
      </div>

      <div className="max-h-[calc(100vh-260px)] overflow-auto p-2">
        {fields.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">No fields yet.</div>
        ) : (
          <div className="space-y-1">
            {fields.map((f) => {
              const active = f.id === selectedId;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onSelect(f.id)}
                  className={[
                    "w-full rounded-xl px-3 py-2 text-left",
                    active ? "bg-gray-900 text-white" : "hover:bg-gray-50",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{f.label || f.key}</div>
                    <div className={active ? "text-xs text-white/70" : "text-xs text-gray-500"}>
                      {typeLabel(String(f.type))}
                      {f.required ? " · required" : ""}
                      {!f.isActive ? " · inactive" : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
