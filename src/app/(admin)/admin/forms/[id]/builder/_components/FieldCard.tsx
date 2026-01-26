"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FormFieldDto } from "./builder.types";
import { isSystemField } from "./builder.types";
import InlineFieldEditor from "./InlineFieldEditor";

function useDndKitRef<T extends HTMLElement>(setNodeRef: (el: T | null) => void) {
  const ref = React.useRef<T | null>(null);
  React.useEffect(() => {
    setNodeRef(ref.current);
    return () => setNodeRef(null);
  }, [setNodeRef]);
  return ref;
}

export default function FieldCard(props: {
  field: FormFieldDto;
  isOpen: boolean;

  onToggleOpen: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onPatch: (patch: Partial<FormFieldDto>) => void;
}) {
  const f = props.field;
  const system = isSystemField(f);

  const s = useSortable({ id: f.id });
  const ref = useDndKitRef<HTMLDivElement>(s.setNodeRef);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(s.transform),
    transition: s.transition,
    opacity: s.isDragging ? 0.6 : 1,
  };

  return (
    <div ref={ref} style={style} className="group rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold text-slate-900">
              {f.label}
            </div>

            {system ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                System
              </span>
            ) : null}

            {!f.isActive ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                Inactive
              </span>
            ) : null}

            {f.required ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                Required
              </span>
            ) : null}

            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              {f.type}
            </span>
          </div>

          {f.placeholder ? (
            <div className="mt-1 truncate text-xs text-slate-500">Placeholder: {f.placeholder}</div>
          ) : null}
          {f.helpText ? (
            <div className="mt-0.5 truncate text-xs text-slate-500">Help: {f.helpText}</div>
          ) : null}
        </div>

        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            title="Drag"
            aria-label="Drag"
            style={{ cursor: "grab" }}
            {...s.attributes}
            {...s.listeners}
          >
            ⠿
          </button>

          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={props.onToggleOpen}
            title="Settings"
            aria-label="Settings"
          >
            ⚙️
          </button>

          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={props.onDuplicate}
            title="Duplicate"
            aria-label="Duplicate"
            disabled={system}
          >
            ⧉
          </button>

          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={props.onDelete}
            title={system ? "System fields cannot be deleted" : "Delete"}
            aria-label="Delete"
            disabled={system}
          >
            🗑️
          </button>
        </div>
      </div>

      {props.isOpen ? (
        <InlineFieldEditor
          key={f.id}
          type={f.type}
          label={f.label}
          required={f.required}
          isActive={f.isActive}
          placeholder={f.placeholder}
          helpText={f.helpText}
          config={f.config}
          disabled={system}
          onPatch={(p) => {
            props.onPatch({
              ...("label" in p ? { label: p.label as string } : {}),
              ...("required" in p ? { required: Boolean(p.required) } : {}),
              ...("isActive" in p ? { isActive: Boolean(p.isActive) } : {}),
              ...("placeholder" in p ? { placeholder: (p.placeholder ?? null) as string | null } : {}),
              ...("helpText" in p ? { helpText: (p.helpText ?? null) as string | null } : {}),
              ...("config" in p ? { config: p.config } : {}),
            });
          }}
        />
      ) : null}
    </div>
  );
}
