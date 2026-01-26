"use client";

/* eslint-disable react-hooks/refs */

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BuilderField, FieldType } from "../builder.types";
import { isSystemField } from "../builder.types";
import InlineFieldEditor from "./InlineFieldEditor";

function typeLabel(t: FieldType): string {
  switch (t) {
    case "TEXT":
      return "Text";
    case "TEXTAREA":
      return "Textarea";
    case "EMAIL":
      return "Email";
    case "PHONE":
      return "Phone";
    case "CHECKBOX":
      return "Checkbox";
    case "SINGLE_SELECT":
      return "Single select";
    case "MULTI_SELECT":
      return "Multi select";
    default:
      return t;
  }
}

function IconGrip() {
  return <span aria-hidden="true" className="text-slate-400">⋮⋮</span>;
}

export default function FieldCard(props: {
  field: BuilderField;
  isOpen: boolean;
  onToggleOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPatch: (
    patch: Partial<{
      key: string;
      label: string;
      type: FieldType;
      required: boolean;
      isActive: boolean;
      placeholder: string | null;
      helpText: string | null;
      config: unknown | null;
    }>
  ) => void;
}) {
  const s = useSortable({
    id: props.field.id,
    data: { kind: "field", fieldId: props.field.id },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(s.transform),
    transition: s.transition,
  };

  const system = isSystemField(props.field);

  return (
    <div ref={s.setNodeRef} style={style} className={["rounded-xl border border-slate-200 bg-white"].join(" ")}>
      <div className="flex items-start gap-2 px-3 py-2">
        <div
          className="mt-1 cursor-grab select-none"
          {...s.attributes}
          {...s.listeners}
          aria-label="Drag handle"
          title="Drag to reorder"
        >
          <IconGrip />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className={["truncate text-sm font-semibold", props.field.isActive ? "text-slate-900" : "text-slate-400"].join(" ")}>
              {props.field.label}
            </div>
            {system ? (
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                System
              </span>
            ) : null}
            {props.field.required ? (
              <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                Required
              </span>
            ) : null}
          </div>

          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
            <span>{typeLabel(props.field.type)}</span>
            <span className="text-slate-300">•</span>
            <span className="lr-mono">{props.field.key}</span>
            {!props.field.isActive ? (
              <>
                <span className="text-slate-300">•</span>
                <span>Inactive</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-slate-50"
            onClick={props.onToggleOpen}
            title="Field settings"
          >
            ⚙︎
          </button>

          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-slate-50"
            onClick={props.onDuplicate}
            title="Duplicate"
          >
            ⎘
          </button>

          <button
            type="button"
            className={[
              "rounded-lg border px-2 py-1 text-xs font-semibold",
              system ? "border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed" : "border-slate-200 bg-white hover:bg-slate-50",
            ].join(" ")}
            onClick={system ? undefined : props.onDelete}
            title={system ? "System fields cannot be deleted" : "Delete"}
            disabled={system}
          >
            🗑
          </button>
        </div>
      </div>

      {props.isOpen ? (
        <div className="border-t border-slate-200 px-3 py-3">
          <InlineFieldEditor field={props.field} onPatch={props.onPatch} isSystem={system} />
        </div>
      ) : null}
    </div>
  );
}
