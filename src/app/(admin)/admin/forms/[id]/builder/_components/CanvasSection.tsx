"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { BuilderField, FieldSection } from "../builder.types";

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

function IconButton(props: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      onClick={props.onClick}
      disabled={props.disabled}
      className={cx(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700",
        props.disabled ? "opacity-40" : "hover:bg-slate-50"
      )}
    >
      {props.children}
    </button>
  );
}

function DropMarker() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
      Hier einfügen
    </div>
  );
}

function SortableRow(props: {
  field: BuilderField;
  readOnly: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.field.id,
    disabled: props.readOnly,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cx(
        "group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3",
        isDragging && "opacity-60"
      )}
    >
      <button
        type="button"
        className={cx(
          "inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500",
          props.readOnly ? "opacity-40" : "hover:bg-slate-100"
        )}
        title={props.readOnly ? "Vorschau" : "Ziehen & Platzieren"}
        aria-label="Ziehen"
        disabled={props.readOnly}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-semibold text-slate-900">{props.field.label}</div>
          {props.field.required ? (
            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
              Pflichtfeld
            </span>
          ) : null}
        </div>
        <div className="truncate text-xs text-slate-500">
          {String(props.field.type)} <span className="text-slate-300">•</span> <span className="font-mono">{props.field.key}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <IconButton title="Einstellungen" onClick={props.onOpen} disabled={props.readOnly}>
          ⚙
        </IconButton>
        <IconButton title="Duplizieren" onClick={props.onDuplicate} disabled={props.readOnly}>
          ⧉
        </IconButton>
        <IconButton title="Löschen" onClick={props.onDelete} disabled={props.readOnly}>
          🗑
        </IconButton>
      </div>
    </div>
  );
}

export default function CanvasSection(props: {
  title: string;
  subtitle: string;

  section: FieldSection;
  droppableId: string;

  fields: BuilderField[];
  readOnly: boolean;

  dropIndex?: number | null;

  onOpenField: (id: string) => void;
  onDuplicateField: (id: string) => void;
  onDeleteField: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: props.droppableId,
    disabled: props.readOnly,
  });

  const dropAt =
    typeof props.dropIndex === "number"
      ? Math.max(0, Math.min(props.dropIndex, props.fields.length))
      : null;

  return (
    <section
      ref={setNodeRef}
      className={cx(
        "rounded-2xl border border-slate-200 bg-white p-4",
        isOver && !props.readOnly && "bg-slate-50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">
            {props.title} <span className="text-slate-300">—</span>{" "}
            <span className="text-slate-500">{props.fields.length} Felder</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">{props.subtitle}</div>
        </div>
      </div>

      <div className="mt-4">
        <SortableContext items={props.fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {props.fields.length === 0 ? (
              dropAt === 0 ? (
                <DropMarker />
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-xs font-semibold text-slate-500">
                  Keine Felder – ziehe etwas aus der Bibliothek hier hinein.
                </div>
              )
            ) : (
              <>
                {props.fields.map((f, idx) => (
                  <React.Fragment key={f.id}>
                    {dropAt === idx ? <DropMarker key={`drop-${idx}`} /> : null}
                    <SortableRow
                      field={f}
                      readOnly={props.readOnly}
                      onOpen={() => props.onOpenField(f.id)}
                      onDuplicate={() => props.onDuplicateField(f.id)}
                      onDelete={() => props.onDeleteField(f.id)}
                    />
                  </React.Fragment>
                ))}
                {dropAt === props.fields.length ? <DropMarker key="drop-end" /> : null}
              </>
            )}
          </div>
        </SortableContext>
      </div>
    </section>
  );
}
