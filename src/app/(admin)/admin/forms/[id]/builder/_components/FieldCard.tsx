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
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="9" cy="7" r="1.3" fill="currentColor" />
      <circle cx="15" cy="7" r="1.3" fill="currentColor" />
      <circle cx="9" cy="12" r="1.3" fill="currentColor" />
      <circle cx="15" cy="12" r="1.3" fill="currentColor" />
      <circle cx="9" cy="17" r="1.3" fill="currentColor" />
      <circle cx="15" cy="17" r="1.3" fill="currentColor" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M19.3 12a7.4 7.4 0 0 0-.1-1.3l1.6-1.2-1.7-3-1.9.7a7.7 7.7 0 0 0-2.1-1.2l-.3-2H11l-.3 2a7.7 7.7 0 0 0-2.1 1.2l-1.9-.7-1.7 3 1.6 1.2a8.2 8.2 0 0 0 0 2.6l-1.6 1.2 1.7 3 1.9-.7a7.7 7.7 0 0 0 2.1 1.2l.3 2h3.4l.3-2a7.7 7.7 0 0 0 2.1-1.2l1.9.7 1.7-3-1.6-1.2c.1-.4.1-.9.1-1.3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconDuplicate() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M9 9h10v10H9V9Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M9 7h6M10 7V5.6c0-.9.7-1.6 1.6-1.6h.8c.9 0 1.6.7 1.6 1.6V7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M6.5 7.8 7.5 20c.1.9.8 1.6 1.7 1.6h5.6c.9 0 1.6-.7 1.7-1.6l1-12.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M5 7h14"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M10 11v6M14 11v6"
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
    "h-9 w-9 inline-flex items-center justify-center rounded-xl border text-slate-700 transition " +
    "focus:outline-none focus:ring-2 focus:ring-slate-300";

  const neutral = "border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100";
  const danger = "border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-700 active:bg-red-100";

  const disabledCls = "border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed";

  return (
    <button
      type="button"
      className={[base, disabled ? disabledCls : tone === "danger" ? danger : neutral].join(" ")}
      onClick={disabled ? undefined : props.onClick}
      title={props.title}
      aria-label={props.ariaLabel}
      disabled={disabled}
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
    <div
      ref={s.setNodeRef}
      style={style}
      className="rounded-2xl border border-slate-200 bg-white"
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <button
          type="button"
          className="mt-0.5 h-9 w-9 inline-flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50 active:bg-slate-100 cursor-grab select-none"
          {...s.attributes}
          {...s.listeners}
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <IconGrip />
        </button>

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
          <IconButton
            title="Field settings"
            ariaLabel="Field settings"
            onClick={props.onToggleOpen}
          >
            <IconSettings />
          </IconButton>

          <IconButton
            title="Duplicate field"
            ariaLabel="Duplicate field"
            onClick={props.onDuplicate}
          >
            <IconDuplicate />
          </IconButton>

          <IconButton
            title={system ? "System fields cannot be deleted" : "Delete field"}
            ariaLabel="Delete field"
            onClick={props.onDelete}
            disabled={system}
            tone="danger"
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
