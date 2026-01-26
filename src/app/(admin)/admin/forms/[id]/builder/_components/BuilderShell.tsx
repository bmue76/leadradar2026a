"use client";

import * as React from "react";
import type { FieldType } from "@prisma/client";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";

import FieldLibrary, { LIB_PREFIX } from "./FieldLibrary";
import Canvas, { CANVAS_ID } from "./Canvas";
import type { FormDto, FormFieldDto } from "./builder.types";
import { isRecord } from "./builder.types";
import { loadForm, createField, deleteField, patchField, reorderFields } from "../builder.persist";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string; traceId: string }
  | { status: "ready"; form: FormDto; fields: FormFieldDto[] };

function fieldLabelForType(t: FieldType): string {
  switch (t) {
    case "TEXT":
      return "Text";
    case "TEXTAREA":
      return "Text area";
    case "EMAIL":
      return "E-mail";
    case "PHONE":
      return "Phone";
    case "CHECKBOX":
      return "Checkbox";
    case "SINGLE_SELECT":
      return "Single select";
    case "MULTI_SELECT":
      return "Multi select";
    default:
      return String(t);
  }
}

function keyPrefixForType(t: FieldType): string {
  switch (t) {
    case "TEXT":
      return "text";
    case "TEXTAREA":
      return "textarea";
    case "EMAIL":
      return "email";
    case "PHONE":
      return "phone";
    case "CHECKBOX":
      return "checkbox";
    case "SINGLE_SELECT":
      return "select";
    case "MULTI_SELECT":
      return "multiselect";
    default:
      return "field";
  }
}

function makeUniqueKey(t: FieldType, existingKeys: Set<string>): string {
  const base = keyPrefixForType(t);
  let i = 1;
  while (i < 5000) {
    const k = `${base}_${i}`;
    if (!existingKeys.has(k)) return k;
    i += 1;
  }
  // fallback (should not happen)
  const k = `${base}_${Date.now()}`;
  return existingKeys.has(k) ? `${base}_${Date.now()}_${Math.floor(Math.random() * 1000)}` : k;
}

function cloneJson(v: unknown): unknown {
  // config is JSON-ish; safe shallow clone by JSON stringify when possible
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return isRecord(v) ? { ...v } : v;
  }
}

export default function BuilderShell(props: { formId: string }) {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const [openFieldId, setOpenFieldId] = React.useState<string | null>(null);
  const [activeDragLabel, setActiveDragLabel] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Debounced reorder (avoid spamming)
  const reorderTimer = React.useRef<number | null>(null);
  const queueReorder = React.useCallback(
    (formId: string, orderedIds: string[]) => {
      if (reorderTimer.current) window.clearTimeout(reorderTimer.current);
      reorderTimer.current = window.setTimeout(() => {
        void reorderFields(formId, orderedIds);
      }, 500);
    },
    []
  );

  React.useEffect(() => {
    let alive = true;
    const run = async () => {
      const res = await loadForm(props.formId);
      if (!alive) return;

      if (!res.ok) {
        setState({ status: "error", message: res.error.message, traceId: res.traceId });
        return;
      }

      const form = res.data;
      const ordered = [...(form.fields ?? [])].sort((a, b) => {
        const ao = Number(a.sortOrder ?? 0);
        const bo = Number(b.sortOrder ?? 0);
        if (ao !== bo) return ao - bo;
        return String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
      });

      setState({ status: "ready", form, fields: ordered });
      setOpenFieldId(null);
    };

    void run();
    return () => {
      alive = false;
    };
  }, [props.formId]);

  const applyLocalPatch = React.useCallback((fieldId: string, patch: Partial<FormFieldDto>) => {
    setState((prev) => {
      if (prev.status !== "ready") return prev;
      const next = prev.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f));
      return { ...prev, fields: next };
    });
  }, []);

  const doPatchField = React.useCallback(
    async (formId: string, fieldId: string, patch: Partial<FormFieldDto>) => {
      // optimistic already applied by caller
      const res = await patchField(formId, fieldId, {
        key: patch.key,
        label: patch.label,
        required: patch.required,
        isActive: patch.isActive,
        placeholder: patch.placeholder === undefined ? undefined : patch.placeholder,
        helpText: patch.helpText === undefined ? undefined : patch.helpText,
        config: patch.config === undefined ? undefined : patch.config,
      });

      if (!res.ok) {
        // rollback by reloading (simple + correct for MVP)
        const reload = await loadForm(formId);
        if (reload.ok) {
          const form = reload.data;
          const ordered = [...(form.fields ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
          setState({ status: "ready", form, fields: ordered });
        } else {
          setState({ status: "error", message: res.error.message, traceId: res.traceId });
        }
      }
    },
    []
  );

  const existingKeys = React.useMemo(() => {
    if (state.status !== "ready") return new Set<string>();
    return new Set(state.fields.map((f) => f.key));
  }, [state]);

  const addField = React.useCallback(
    async (t: FieldType, insertIndex: number | null) => {
      if (state.status !== "ready") return;

      const formId = state.form.id;
      const k = makeUniqueKey(t, existingKeys);

      const res = await createField(formId, {
        key: k,
        label: fieldLabelForType(t),
        type: t,
        required: false,
        isActive: true,
        placeholder: null,
        helpText: null,
        config: undefined,
      });

      if (!res.ok) {
        setState({ status: "error", message: res.error.message, traceId: res.traceId });
        return;
      }

      const created = res.data;
      setState((prev) => {
        if (prev.status !== "ready") return prev;
        const next = [...prev.fields];
        const idx = insertIndex === null ? next.length : Math.max(0, Math.min(next.length, insertIndex));
        next.splice(idx, 0, created);
        return { ...prev, fields: next };
      });

      // Persist order immediately (permutation contract)
      const nextIds = (() => {
        const fields = state.status === "ready" ? state.fields : [];
        const after = [...fields];
        const idx = insertIndex === null ? after.length : Math.max(0, Math.min(after.length, insertIndex));
        after.splice(idx, 0, created);
        return after.map((f) => f.id);
      })();

      const r = await reorderFields(formId, nextIds);
      if (!r.ok) {
        setState({ status: "error", message: r.error.message, traceId: r.traceId });
        return;
      }
    },
    [existingKeys, state]
  );

  const onQuickAdd = React.useCallback(
    (t: FieldType) => {
      void addField(t, null);
    },
    [addField]
  );

  const onToggleOpen = React.useCallback((fieldId: string) => {
    setOpenFieldId((cur) => (cur === fieldId ? null : fieldId));
  }, []);

  const onDelete = React.useCallback(async (fieldId: string) => {
    if (state.status !== "ready") return;
    const formId = state.form.id;

    // optimistic remove
    const nextFields = state.fields.filter((f) => f.id !== fieldId);
    setState({ ...state, fields: nextFields });
    if (openFieldId === fieldId) setOpenFieldId(null);

    const del = await deleteField(formId, fieldId);
    if (!del.ok) {
      setState({ status: "error", message: del.error.message, traceId: del.traceId });
      return;
    }

    const ids = nextFields.map((f) => f.id);
    const r = await reorderFields(formId, ids);
    if (!r.ok) {
      setState({ status: "error", message: r.error.message, traceId: r.traceId });
      return;
    }
  }, [openFieldId, state]);

  const onDuplicate = React.useCallback(async (fieldId: string) => {
    if (state.status !== "ready") return;
    const formId = state.form.id;
    const idx = state.fields.findIndex((f) => f.id === fieldId);
    if (idx < 0) return;

    const src = state.fields[idx];
    const k = makeUniqueKey(src.type, existingKeys);

    const res = await createField(formId, {
      key: k,
      label: `${src.label} (Copy)`,
      type: src.type,
      required: src.required,
      isActive: src.isActive,
      placeholder: src.placeholder,
      helpText: src.helpText,
      config: cloneJson(src.config),
    });

    if (!res.ok) {
      setState({ status: "error", message: res.error.message, traceId: res.traceId });
      return;
    }

    const created = res.data;
    const nextFields = [...state.fields];
    nextFields.splice(idx + 1, 0, created);
    setState({ ...state, fields: nextFields });

    const r = await reorderFields(formId, nextFields.map((f) => f.id));
    if (!r.ok) {
      setState({ status: "error", message: r.error.message, traceId: r.traceId });
      return;
    }
  }, [existingKeys, state]);

  const onPatch = React.useCallback(
    (fieldId: string, patch: Partial<FormFieldDto>) => {
      if (state.status !== "ready") return;
      applyLocalPatch(fieldId, patch);
      void doPatchField(state.form.id, fieldId, patch);
    },
    [applyLocalPatch, doPatchField, state]
  );

  const onDragStart = React.useCallback((ev: DragStartEvent) => {
    const id = String(ev.active.id);
    if (id.startsWith(LIB_PREFIX)) {
      const t = id.slice(LIB_PREFIX.length) as FieldType;
      setActiveDragLabel(`Add: ${fieldLabelForType(t)}`);
      return;
    }
    setActiveDragLabel("Move field");
  }, []);

  const onDragEnd = React.useCallback(
    (ev: DragEndEvent) => {
      setActiveDragLabel(null);

      if (state.status !== "ready") return;

      const activeId = String(ev.active.id);
      const overId = ev.over ? String(ev.over.id) : null;

      // Drag from library -> create field
      if (activeId.startsWith(LIB_PREFIX)) {
        const t = activeId.slice(LIB_PREFIX.length) as FieldType;

        if (!overId) return;

        // drop on canvas container -> append
        if (overId === CANVAS_ID) {
          void addField(t, null);
          return;
        }

        // drop on a field -> insert before that field
        const idx = state.fields.findIndex((f) => f.id === overId);
        if (idx >= 0) {
          void addField(t, idx);
        }
        return;
      }

      // Reorder existing fields
      if (!overId) return;
      if (overId === CANVAS_ID) return;

      const oldIndex = state.fields.findIndex((f) => f.id === activeId);
      const newIndex = state.fields.findIndex((f) => f.id === overId);
      if (oldIndex < 0 || newIndex < 0) return;
      if (oldIndex === newIndex) return;

      const next = arrayMove(state.fields, oldIndex, newIndex);
      setState({ ...state, fields: next });

      queueReorder(state.form.id, next.map((f) => f.id));
    },
    [addField, queueReorder, state]
  );

  if (state.status === "loading") {
    return (
      <div className="lr-page">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
          <div className="mt-3 h-3 w-64 animate-pulse rounded bg-slate-100" />
          <div className="mt-6 h-40 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="lr-page">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Error</div>
          <div className="mt-1 text-sm text-slate-600">{state.message}</div>
          <div className="mt-2 text-xs text-slate-500">traceId: {state.traceId}</div>
          <div className="mt-4">
            <a className="lr-btnSecondary" href={`/admin/forms/${props.formId}/builder`}>
              Retry
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lr-page">
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex items-start gap-4">
          <FieldLibrary onQuickAdd={onQuickAdd} />
          <Canvas
            formName={state.form.name}
            fields={state.fields}
            openFieldId={openFieldId}
            onToggleOpen={onToggleOpen}
            onDelete={(id) => void onDelete(id)}
            onDuplicate={(id) => void onDuplicate(id)}
            onPatch={onPatch}
          />
        </div>

        <DragOverlay>
          {activeDragLabel ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800">
              {activeDragLabel}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
