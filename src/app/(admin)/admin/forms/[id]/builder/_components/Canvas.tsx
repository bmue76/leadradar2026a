"use client";

/* eslint-disable react-hooks/refs */

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { BuilderField, FieldType } from "../builder.types";
import FieldCard from "./FieldCard";

export default function Canvas(props: {
  formId: string;
  fields: BuilderField[];
  openFieldId: string | null;
  onToggleOpen: (fieldId: string) => void;
  onDuplicate: (fieldId: string) => void;
  onDelete: (fieldId: string) => void;
  onPatchField: (
    fieldId: string,
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
  const droppable = useDroppable({ id: "canvas" });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold">Canvas</div>
          <div className="text-xs text-slate-500">Drag fields to reorder. Click ⚙︎ for settings.</div>
        </div>
        <div className="text-xs text-slate-500">{props.fields.length} field(s)</div>
      </div>

      <div
        ref={droppable.setNodeRef}
        className={[
          "mt-3 min-h-[320px] rounded-xl border border-slate-200 bg-white p-2",
          droppable.isOver ? "ring-2 ring-slate-200" : "",
        ].join(" ")}
      >
        {props.fields.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
            Drag a field here
          </div>
        ) : (
          <SortableContext items={props.fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {props.fields.map((f) => (
                <FieldCard
                  key={f.id}
                  field={f}
                  isOpen={props.openFieldId === f.id}
                  onToggleOpen={() => props.onToggleOpen(f.id)}
                  onDuplicate={() => props.onDuplicate(f.id)}
                  onDelete={() => props.onDelete(f.id)}
                  onPatch={(patch) => props.onPatchField(f.id, patch)}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}
