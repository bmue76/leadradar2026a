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
  // 2×3 dot grip
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="6" cy="4" r="1.2" fill="currentColor" />
      <circle cx="12" cy="4" r="1.2" fill="currentColor" />
      <circle cx="6" cy="9" r="1.2" fill="currentColor" />
      <circle cx="12" cy="9" r="1.2" fill="currentColor" />
      <circle cx="6" cy="14" r="1.2" fill="currentColor" />
      <circle cx="12" cy="14" r="1.2" fill="currentColor" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 13.1a8.6 8.6 0 0 0 0-2.2l2-1.5-2-3.5-2.4 1a8.8 8.8 0 0 0-1.9-1.1l-.3-2.6H10l-.3 2.6c-.7.3-1.3.6-1.9 1.1l-2.4-1-2 3.5 2 1.5a8.6 8.6 0 0 0 0 2.2l-2 1.5 2 3.5 2.4-1c.6.5 1.2.8 1.9 1.1l.3 2.6h4.4l.3-2.6c.7-.3 1.3-.6 1.9-1.1l2.4 1 2-3.5-2-1.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 8h10v12H8V8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M6 16H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 3h6m-8 5h10m-9 0 .7 13h6.6L16 8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 12v6M14 12v6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconButton(props: {
  title: string;
  ariaLabel: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger";
  children: React.ReactNode;
}) {
  const tone = props.tone ?? "neutral";
  const disabled = !!props.disabled;

  const base =
    "h-9 w-9 inline-flex items-center justify-center rounded-xl border text-slate-600 bg-white";
  const hover =
    tone === "danger"
      ? "hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
      : "hover:bg-slate-50 hover:text-slate-900";
  const active =
    tone === "danger" ? "active:bg-rose-100" : "active:bg-slate-100";
  const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300";
  const disabledCls = "opacity-40 cursor-not-allowed hover:bg-white hover:text-slate-600";

  return (
    <button
      type="button"
      className={[base, "border-slate-200", focus, disabled ? disabledCls : `${hover} ${active}`].join(" ")}
      onClick={disabled ? undefined : props.onClick}
      disabled={disabled}
      title={props.title}
      aria-label={props.ariaLabel}
    >
      {props.children}
    </button>
  );
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
    <div ref={s.setNodeRef} style={style} className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-start gap-3 px-3 py-3">
        <div
          className="mt-1 cursor-grab select-none text-slate-400 hover:text-slate-600"
          {...s.attributes}
          {...s.listeners}
          aria-label="Drag handle"
          title="Drag to reorder"
        >
          <IconGrip />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div
              className={[
                "truncate text-sm font-semibold",
                props.field.isActive ? "text-slate-900" : "text-slate-400",
              ].join(" ")}
            >
              {props.field.label}
            </div>

            {system ? (
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                System
              </span>
            ) : null}

            {props.field.required ? (
              <span className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                Required
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
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
          <IconButton title="Field settings" ariaLabel="Field settings" onClick={props.onToggleOpen}>
            <IconGear />
          </IconButton>

          <IconButton title="Duplicate" ariaLabel="Duplicate field" onClick={props.onDuplicate}>
            <IconCopy />
          </IconButton>

          <IconButton
            title={system ? "System fields cannot be deleted" : "Delete"}
            ariaLabel="Delete field"
            tone="danger"
            onClick={system ? undefined : props.onDelete}
            disabled={system}
          >
            <IconTrash />
          </IconButton>
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
