"use client";

import * as React from "react";
import type { FormField } from "../../formDetail.types";

const TYPE_LABELS: Record<string, string> = {
  TEXT: "Text",
  TEXTAREA: "Textarea",
  EMAIL: "Email",
  PHONE: "Phone",
  SINGLE_SELECT: "Select (single)",
  MULTI_SELECT: "Select (multi)",
  CHECKBOX: "Checkbox",
};

function typeLabel(t: unknown) {
  const u = String(t || "").toUpperCase();
  return TYPE_LABELS[u] ?? (u || "—");
}

export default function FieldsList(props: {
  fields: FormField[];
  selectedId: string;
  onSelect: (id: string) => void;

  onAdd: () => void;

  orderDirty: boolean;
  orderBusy: boolean;
  onMoveUp: (fieldId: string) => void;
  onMoveDown: (fieldId: string) => void;
  onSaveOrder: () => void;
}) {
  return (
    <div className="rounded-2xl border bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Fields</div>
          <div className="text-xs text-gray-500">{props.fields.length} field(s)</div>
        </div>

        <div className="flex items-center gap-2">
          {props.orderDirty ? (
            <button
              type="button"
              onClick={props.onSaveOrder}
              disabled={props.orderBusy}
              className={[
                "rounded-lg border px-3 py-1.5 text-sm",
                props.orderBusy ? "bg-gray-50 text-gray-500" : "hover:bg-gray-50",
              ].join(" ")}
            >
              {props.orderBusy ? "Saving…" : "Save order"}
            </button>
          ) : null}

          <button
            type="button"
            onClick={props.onAdd}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Add
          </button>
        </div>
      </div>

      <div className="max-h-[calc(100vh-220px)] overflow-auto p-2">
        {props.fields.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">No fields yet.</div>
        ) : (
          <div className="space-y-1">
            {props.fields.map((f, idx) => {
              const active = f.id === props.selectedId;
              return (
                <div key={f.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => props.onSelect(f.id)}
                    className={[
                      "w-full rounded-xl px-3 py-2 text-left",
                      active ? "bg-gray-900 text-white" : "hover:bg-gray-50",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{f.label || f.key}</div>
                        <div className={active ? "text-xs text-white/70" : "text-xs text-gray-500"}>
                          {typeLabel(f.type)}
                          {f.required ? " · required" : ""}
                          {!f.isActive ? " · inactive" : ""}
                        </div>
                      </div>

                      {/* Reorder buttons */}
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            props.onMoveUp(f.id);
                          }}
                          disabled={idx === 0 || props.orderBusy}
                          className={[
                            "rounded-lg border px-2 py-1 text-xs",
                            active ? "border-white/30 text-white hover:bg-white/10" : "hover:bg-gray-50",
                            (idx === 0 || props.orderBusy) ? "opacity-40" : "",
                          ].join(" ")}
                          aria-label="Move up"
                        >
                          ↑
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            props.onMoveDown(f.id);
                          }}
                          disabled={idx === props.fields.length - 1 || props.orderBusy}
                          className={[
                            "rounded-lg border px-2 py-1 text-xs",
                            active ? "border-white/30 text-white hover:bg-white/10" : "hover:bg-gray-50",
                            (idx === props.fields.length - 1 || props.orderBusy) ? "opacity-40" : "",
                          ].join(" ")}
                          aria-label="Move down"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
