"use client";

import * as React from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { FormField } from "../../../formDetail.types";
import type { FieldType } from "../../../_lib/builderV2.types";
import { fieldTypeLabel } from "../../../_lib/builderV2.types";

import AddFieldModal from "./AddFieldModal";

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function DragHandle({
  disabled,
  attributes,
  listeners,
  active,
}: {
  disabled: boolean;
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
  active: boolean;
}) {
  return (
    <button
      type="button"
      className={clsx(
        "rounded-lg border px-2 py-1 text-xs",
        active ? "border-white/25 text-white hover:bg-white/10" : "border-gray-200 text-gray-700 hover:bg-gray-50",
        "cursor-grab active:cursor-grabbing"
      )}
      aria-label="Drag to reorder"
      disabled={disabled}
      {...attributes}
      {...(listeners ?? {})}
    >
      ⠿
    </button>
  );
}

function InsertBetween({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <div className="group/insert relative flex items-center justify-center py-3">
      <div className="h-px w-full bg-gray-100" />
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={clsx(
          "absolute rounded-full border bg-white px-3 py-1 text-xs text-gray-700 shadow-sm",
          "opacity-0 transition group-hover/insert:opacity-100",
          "hover:bg-gray-50 disabled:opacity-40"
        )}
        aria-label="Add field here"
        title="Add field"
      >
        + Add field
      </button>
    </div>
  );
}

function Card({
  field,
  selected,
  disabled,
  onSelect,
  onDuplicate,
  onDelete,
  onToggleRequired,
  onToggleActive,
}: {
  field: FormField;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleRequired: () => void;
  onToggleActive: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const type = String(field.type || "TEXT").toUpperCase() as FieldType;

  return (
    <div ref={setNodeRef} style={style} className="group">
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onSelect();
        }}
        className={clsx(
          "relative rounded-2xl border bg-white p-4 shadow-sm transition",
          selected ? "border-gray-900 ring-1 ring-black/5" : "border-gray-200 hover:border-gray-300"
        )}
      >
        {/* subtle left accent when selected */}
        {selected ? <div className="absolute left-0 top-3 h-[calc(100%-24px)] w-1 rounded-r bg-gray-900" /> : null}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-gray-900">{field.label || field.key}</div>
            <div className="mt-0.5 text-xs text-gray-500">{fieldTypeLabel(type)}</div>

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleRequired();
                }}
                disabled={disabled}
                className={clsx(
                  "rounded-full border px-2.5 py-1 text-xs",
                  field.required
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                )}
              >
                Required
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleActive();
                }}
                disabled={disabled}
                className={clsx(
                  "rounded-full border px-2.5 py-1 text-xs",
                  field.isActive
                    ? "border-gray-200 text-gray-700 hover:bg-gray-50"
                    : "border-gray-900 bg-gray-900 text-white"
                )}
              >
                {field.isActive ? "Active" : "Inactive"}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="opacity-0 transition group-hover:opacity-100">
              <DragHandle disabled={disabled} attributes={attributes} listeners={listeners} active={selected} />
            </div>

            <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate();
                }}
                disabled={disabled}
                className="rounded-lg border px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                disabled={disabled}
                className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800 hover:bg-red-100"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FieldCanvas(props: {
  fields: FormField[];
  selectedId: string;
  showInactive: boolean;

  disabled?: boolean;

  onSelect: (id: string) => void;
  onReorderVisible: (nextVisibleOrderIds: string[], visibleIds: string[]) => void;

  onAddField: (input?: { label?: string; type?: FieldType }) => void;
  onDuplicateField: (id: string) => void;
  onDeleteField: (id: string) => void;

  onPatchFieldFlags: (id: string, patch: { required?: boolean; isActive?: boolean }) => void;
}) {
  const disabled = Boolean(props.disabled);

  const [addOpen, setAddOpen] = React.useState(false);

  const visibleFields = React.useMemo(() => {
    if (props.showInactive) return props.fields;
    return props.fields.filter((f) => Boolean(f.isActive));
  }, [props.fields, props.showInactive]);

  const visibleIds = React.useMemo(() => visibleFields.map((f) => f.id), [visibleFields]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const oldIndex = visibleIds.indexOf(activeId);
    const newIndex = visibleIds.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(visibleIds, oldIndex, newIndex);
    props.onReorderVisible(next, visibleIds);
  }

  return (
    <div className="rounded-2xl border bg-white p-4">
      {visibleFields.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <div className="text-base font-medium">Add your first field</div>
          <div className="mt-1 text-sm text-gray-500">Start by adding a text field or a select field.</div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-4 rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Add field
          </button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-0">
              {visibleFields.map((f, idx) => (
                <div key={f.id}>
                  <Card
                    field={f}
                    selected={f.id === props.selectedId}
                    disabled={disabled}
                    onSelect={() => props.onSelect(f.id)}
                    onDuplicate={() => props.onDuplicateField(f.id)}
                    onDelete={() => props.onDeleteField(f.id)}
                    onToggleRequired={() => props.onPatchFieldFlags(f.id, { required: !Boolean(f.required) })}
                    onToggleActive={() => props.onPatchFieldFlags(f.id, { isActive: !Boolean(f.isActive) })}
                  />
                  {/* between-cards insert affordance */}
                  {idx < visibleFields.length - 1 ? (
                    <InsertBetween onClick={() => setAddOpen(true)} disabled={disabled} />
                  ) : null}
                </div>
              ))}

              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="w-full rounded-2xl border border-dashed px-4 py-4 text-sm text-gray-700 hover:bg-gray-50"
                >
                  + Add field
                </button>
              </div>
            </div>
          </SortableContext>
        </DndContext>
      )}

      <AddFieldModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreate={(type) => {
          props.onAddField({ type, label: fieldTypeLabel(type) });
          setAddOpen(false);
        }}
      />
    </div>
  );
}
