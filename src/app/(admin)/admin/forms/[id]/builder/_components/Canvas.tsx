"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { FormFieldDto } from "./builder.types";
import FieldCard from "./FieldCard";

const CANVAS_ID = "canvas";

function useDndKitRef<T extends HTMLElement>(setNodeRef: (el: T | null) => void) {
  const ref = React.useRef<T | null>(null);
  React.useEffect(() => {
    setNodeRef(ref.current);
    return () => setNodeRef(null);
  }, [setNodeRef]);
  return ref;
}

export default function Canvas(props: {
  formName: string;
  fields: FormFieldDto[];
  openFieldId: string | null;

  onToggleOpen: (fieldId: string) => void;
  onDelete: (fieldId: string) => void;
  onDuplicate: (fieldId: string) => void;
  onPatch: (fieldId: string, patch: Partial<FormFieldDto>) => void;
}) {
  const droppable = useDroppable({ id: CANVAS_ID });
  const ref = useDndKitRef<HTMLDivElement>(droppable.setNodeRef);

  return (
    <section className="min-w-0 flex-1">
      <div className="mb-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Builder</div>
        <div className="mt-1 text-lg font-bold text-slate-900">{props.formName}</div>
      </div>

      <div
        ref={ref}
        className={[
          "rounded-2xl border border-slate-200 bg-white p-3",
          droppable.isOver ? "ring-2 ring-slate-200" : "",
        ].join(" ")}
      >
        {props.fields.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-6 text-center">
            <div className="text-sm font-semibold text-slate-900">Empty form</div>
            <div className="mt-1 text-sm text-slate-600">Drag a field here from the library.</div>
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
                  onDelete={() => props.onDelete(f.id)}
                  onDuplicate={() => props.onDuplicate(f.id)}
                  onPatch={(patch) => props.onPatch(f.id, patch)}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </section>
  );
}

export { CANVAS_ID };
