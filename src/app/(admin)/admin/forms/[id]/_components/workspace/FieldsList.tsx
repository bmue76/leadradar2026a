"use client";

import * as React from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { FormField } from "../../formDetail.types";

type Props = {
  fields: FormField[];
  selectedId: string;
  onSelect: (id: string) => void;

  onAdd: () => void;

  orderDirty: boolean;
  orderBusy: boolean;
  onSaveOrder: () => void;

  // IMPORTANT: erwartet eine Liste von IDs in der neuen Reihenfolge
  onReorder: (nextOrderIds: string[]) => void;
};

function typeLabel(t: unknown): string {
  const u = String(t || "").toUpperCase();
  switch (u) {
    case "TEXT":
      return "Text";
    case "TEXTAREA":
      return "Textarea";
    case "EMAIL":
      return "Email";
    case "PHONE":
      return "Phone";
    case "SINGLE_SELECT":
      return "Select (single)";
    case "MULTI_SELECT":
      return "Select (multi)";
    case "CHECKBOX":
      return "Checkbox";
    default:
      return u || "—";
  }
}

function FieldRow({
  f,
  active,
  disabled,
  onSelect,
}: {
  f: FormField;
  active: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: f.id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <div
        className={[
          "w-full rounded-xl border px-3 py-2",
          active ? "border-gray-900 bg-gray-900 text-white" : "border-transparent hover:bg-gray-50",
        ].join(" ")}
      >
        <div className="flex items-start gap-2">
          {/* Selection area */}
          <button
            type="button"
            onClick={() => onSelect(f.id)}
            className="min-w-0 flex-1 text-left"
            disabled={disabled}
          >
            <div className="truncate text-sm font-semibold">{f.label || f.key}</div>
            <div className={active ? "text-xs text-white/70" : "text-xs text-gray-500"}>
              {typeLabel(f.type)}
              {f.required ? " · required" : ""}
              {!f.isActive ? " · inactive" : ""}
            </div>
          </button>

          {/* Drag handle */}
          <button
            type="button"
            className={[
              "mt-0.5 rounded-lg border px-2 py-1 text-xs",
              active ? "border-white/30 text-white hover:bg-white/10" : "border-gray-200 text-gray-600 hover:bg-gray-50",
              "opacity-0 transition group-hover:opacity-100",
              "cursor-grab active:cursor-grabbing", // 👈 Händchen + grabbing beim Klicken
            ].join(" ")}
            aria-label="Drag to reorder"
            disabled={disabled}
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
          
        </div>
      </div>
    </div>
  );
}

export default function FieldsList(props: Props) {
  const ids = React.useMemo(() => props.fields.map((f) => f.id), [props.fields]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }, // verhindert "click = drag"
    })
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;

    // wenn über nichts gedroppt -> NICHTS tun (sonst newIndex=-1 => ans Ende)
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId === overId) return;

    const oldIndex = ids.indexOf(activeId);
    const newIndex = ids.indexOf(overId);

    // wenn overId nicht in ids ist (z.B. Container-ID), NICHTS tun
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(ids, oldIndex, newIndex);
    props.onReorder(next);
  }

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
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
            >
              {props.orderBusy ? "Saving…" : "Save order"}
            </button>
          ) : (
            <div className="text-xs text-gray-400">Order is saved</div>
          )}

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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {props.fields.map((f) => (
                  <FieldRow
                    key={f.id}
                    f={f}
                    active={f.id === props.selectedId}
                    disabled={props.orderBusy}
                    onSelect={props.onSelect}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
