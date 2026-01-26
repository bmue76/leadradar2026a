"use client";

import * as React from "react";
import type { FieldType } from "@prisma/client";
import { useDraggable } from "@dnd-kit/core";

const LIB_PREFIX = "lib:";

type LibraryItem = {
  type: FieldType;
  label: string;
  hint?: string;
};

const ITEMS: LibraryItem[] = [
  { type: "TEXT", label: "Text" },
  { type: "TEXTAREA", label: "Text area" },
  { type: "EMAIL", label: "E-mail" },
  { type: "PHONE", label: "Phone" },
  { type: "CHECKBOX", label: "Checkbox" },
  { type: "SINGLE_SELECT", label: "Single select" },
  { type: "MULTI_SELECT", label: "Multi select" },
];

function useDndKitRef<T extends HTMLElement>(setNodeRef: (el: T | null) => void) {
  const ref = React.useRef<T | null>(null);
  React.useEffect(() => {
    setNodeRef(ref.current);
    return () => setNodeRef(null);
  }, [setNodeRef]);
  return ref;
}

function DraggableLibraryRow(props: { item: LibraryItem; onQuickAdd: (t: FieldType) => void }) {
  const id = `${LIB_PREFIX}${props.item.type}`;
  const d = useDraggable({ id, data: { kind: "library", fieldType: props.item.type } });

  const ref = useDndKitRef<HTMLButtonElement>(d.setNodeRef);

  return (
    <button
      type="button"
      ref={ref}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50 active:bg-slate-100"
      onClick={() => props.onQuickAdd(props.item.type)}
      aria-label={`Add ${props.item.label}`}
      title="Drag onto canvas or click to add"
      style={{
        opacity: d.isDragging ? 0.6 : 1,
        cursor: d.isDragging ? "grabbing" : "grab",
      }}
      {...d.listeners}
      {...d.attributes}
    >
      <div className="text-sm font-semibold text-slate-900">{props.item.label}</div>
      {props.item.hint ? <div className="mt-0.5 text-xs text-slate-500">{props.item.hint}</div> : null}
    </button>
  );
}

export default function FieldLibrary(props: { onQuickAdd: (t: FieldType) => void }) {
  return (
    <aside className="w-[280px] shrink-0">
      <div className="sticky top-[72px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Field Library</div>
          <div className="mt-3 flex flex-col gap-2">
            {ITEMS.map((it) => (
              <DraggableLibraryRow key={it.type} item={it} onQuickAdd={props.onQuickAdd} />
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            Drag a field onto the canvas or click to add.
          </div>
        </div>
      </div>
    </aside>
  );
}

export { LIB_PREFIX };
