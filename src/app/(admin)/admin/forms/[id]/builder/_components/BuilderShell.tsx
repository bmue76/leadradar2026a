"use client";

import * as React from "react";
import type { DragEndEvent, DragStartEvent, UniqueIdentifier } from "@dnd-kit/core";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import type { BuilderField, LibraryItem } from "../builder.types";
import { isSystemField } from "../builder.types";
import {
  loadForm,
  createField,
  deleteField,
  patchField,
  reorderFields,
  patchFormBasics,
  patchFormStatus,
} from "../builder.persist";

import FieldLibrary, { LIB_ITEMS } from "./FieldLibrary";
import Canvas from "./Canvas";
import FormSettingsPanel from "./FormSettingsPanel";

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string; traceId: string };

function safeTraceId(v: unknown): string {
  if (typeof v === "string" && v.trim()) return v.trim();
  return "—";
}

function uniqKey(base: string, used: Set<string>): string {
  const clean = base.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
  const start = clean.length ? clean : "field";
  if (!used.has(start)) return start;

  for (let i = 2; i < 200; i++) {
    const k = `${start}_${i}`;
    if (!used.has(k)) return k;
  }
  return `${start}_${Date.now()}`;
}

function insertAt<T>(arr: T[], idx: number, item: T): T[] {
  const clamped = Math.max(0, Math.min(idx, arr.length));
  return [...arr.slice(0, clamped), item, ...arr.slice(clamped)];
}

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [it] = copy.splice(from, 1);
  copy.splice(to, 0, it);
  return copy;
}

type ActiveData =
  | { kind: "library"; item: LibraryItem }
  | { kind: "field"; fieldId: string };

type ActiveDrag =
  | { kind: "none" }
  | { kind: "library"; item: LibraryItem }
  | { kind: "field"; fieldId: string };

export default function BuilderShell({ formId }: { formId: string }) {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });

  const [formName, setFormName] = React.useState<string>("");
  const [formDescription, setFormDescription] = React.useState<string | null>(null);
  const [formStatus, setFormStatus] = React.useState<"DRAFT" | "ACTIVE" | "ARCHIVED">("DRAFT");
  const [formConfig, setFormConfig] = React.useState<unknown | null>(null);

  const [fields, setFields] = React.useState<BuilderField[]>([]);
  const [openFieldId, setOpenFieldId] = React.useState<string | null>(null);

  const [flash, setFlash] = React.useState<string | null>(null);
  const [activeDrag, setActiveDrag] = React.useState<ActiveDrag>({ kind: "none" });

  const reqSeq = React.useRef(0);
  const saveSeq = React.useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = React.useCallback(async () => {
    const seq = ++reqSeq.current;
    setState({ status: "loading" });

    const res = await loadForm(formId);
    if (seq !== reqSeq.current) return;

    if (!res.ok) {
      setFields([]);
      setState({
        status: "error",
        message: res.message || "Not found.",
        traceId: safeTraceId(res.traceId),
      });
      return;
    }

    setFormName(res.data.name);
    setFormDescription(res.data.description ?? null);
    setFormStatus(res.data.status);
    setFormConfig(res.data.config ?? null);

    setFields(res.data.fields);
    setOpenFieldId(null);
    setState({ status: "ready" });
  }, [formId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const showFlash = React.useCallback((msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 1600);
  }, []);

  const persistOrder = React.useCallback(
    async (nextFields: BuilderField[]) => {
      const seq = ++saveSeq.current;
      const orderedIds = nextFields.map((f) => f.id);

      const r = await reorderFields(formId, orderedIds);
      if (seq !== saveSeq.current) return;

      if (!r.ok) {
        setState({
          status: "error",
          message: r.message || "Couldn’t save order.",
          traceId: safeTraceId(r.traceId),
        });
        return;
      }
    },
    [formId]
  );

  function itemToCreatePayload(item: LibraryItem): {
    keyBase: string;
    label: string;
    type: LibraryItem["type"];
    placeholder?: string | null;
    helpText?: string | null;
    config?: unknown | null;
    isContact: boolean;
    contactKey?: string;
  } {
    if (item.kind === "contact") {
      return {
        keyBase: item.key,
        label: item.defaultLabel,
        type: item.type,
        placeholder: item.defaultPlaceholder ?? null,
        helpText: item.defaultHelpText ?? null,
        config: null,
        isContact: true,
        contactKey: item.key,
      };
    }

    return {
      keyBase: item.keyBase,
      label: item.defaultLabel,
      type: item.type,
      placeholder: item.defaultPlaceholder ?? null,
      helpText: item.defaultHelpText ?? null,
      config: item.defaultConfig !== undefined ? (item.defaultConfig as unknown) : null,
      isContact: false,
    };
  }

  const addFromLibrary = React.useCallback(
    async (item: LibraryItem, insertIndex: number) => {
      // contact fields: if key already exists -> open existing instead of creating duplicate
      if (item.kind === "contact") {
        const existing = fields.find((f) => f.key === item.key);
        if (existing) {
          setOpenFieldId(existing.id);
          showFlash("Contact field already exists.");
          return;
        }
      }

      const used = new Set(fields.map((f) => f.key));
      const payload = itemToCreatePayload(item);

      // ensure unique key
      let key = uniqKey(payload.keyBase, used);

      // retry on 409 key conflict (race)
      for (let attempt = 0; attempt < 5; attempt++) {
        const created = await createField(formId, {
          key,
          label: payload.label,
          type: payload.type,
          required: false,
          isActive: true,
          placeholder: payload.placeholder ?? null,
          helpText: payload.helpText ?? null,
          config: payload.config ?? null,
        });

        if (created.ok) {
          const next = insertAt(fields, insertIndex, created.data);
          setFields(next);
          setOpenFieldId(created.data.id);

          await persistOrder(next);
          showFlash("Field added.");
          return;
        }

        if ((created.status === 409 || created.code === "KEY_CONFLICT") && attempt < 4) {
          used.add(key);
          key = uniqKey(payload.keyBase, used);
          continue;
        }

        setState({
          status: "error",
          message: created.message || "Couldn’t create field.",
          traceId: safeTraceId(created.traceId),
        });
        return;
      }
    },
    [fields, formId, persistOrder, showFlash]
  );

  const addManyFromLibrary = React.useCallback(
    async (items: LibraryItem[], insertIndex: number) => {
      let cur = fields;
      let idx = Math.max(0, Math.min(insertIndex, cur.length));
      const used = new Set(cur.map((f) => f.key));

      let added = 0;
      let skipped = 0;
      let lastOpened: string | null = null;

      for (const item of items) {
        // de-dupe contact fields by key
        if (item.kind === "contact") {
          const existing = cur.find((f) => f.key === item.key);
          if (existing) {
            skipped++;
            lastOpened = existing.id;
            continue;
          }
        }

        const payload = itemToCreatePayload(item);
        let key = uniqKey(payload.keyBase, used);

        let createdOk = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          const created = await createField(formId, {
            key,
            label: payload.label,
            type: payload.type,
            required: false,
            isActive: true,
            placeholder: payload.placeholder ?? null,
            helpText: payload.helpText ?? null,
            config: payload.config ?? null,
          });

          if (created.ok) {
            cur = insertAt(cur, idx, created.data);
            idx++;
            used.add(key);
            added++;
            lastOpened = created.data.id;
            createdOk = true;
            break;
          }

          if ((created.status === 409 || created.code === "KEY_CONFLICT") && attempt < 4) {
            used.add(key);
            key = uniqKey(payload.keyBase, used);
            continue;
          }

          setState({
            status: "error",
            message: created.message || "Couldn’t create field.",
            traceId: safeTraceId(created.traceId),
          });
          return; // abort batch on hard error
        }

        if (!createdOk) return;
      }

      setFields(cur);
      if (lastOpened) setOpenFieldId(lastOpened);
      await persistOrder(cur);

      if (added > 0 && skipped > 0) showFlash(`Added ${added} field(s). Skipped ${skipped} existing contact field(s).`);
      else if (added > 0) showFlash(`Added ${added} field(s).`);
      else showFlash("Nothing to add (all contact fields already exist).");
    },
    [fields, formId, persistOrder, showFlash]
  );

  const onReorder = React.useCallback(
    async (fromId: string, toId: string) => {
      const fromIdx = fields.findIndex((f) => f.id === fromId);
      const toIdx = fields.findIndex((f) => f.id === toId);
      if (fromIdx < 0 || toIdx < 0) return;

      const next = arrayMove(fields, fromIdx, toIdx);
      setFields(next);
      await persistOrder(next);
    },
    [fields, persistOrder]
  );

  const onToggleOpen = React.useCallback((fieldId: string) => {
    setOpenFieldId((cur) => (cur === fieldId ? null : fieldId));
  }, []);

  const onDuplicate = React.useCallback(
    async (fieldId: string) => {
      const src = fields.find((f) => f.id === fieldId);
      if (!src) return;

      const used = new Set(fields.map((f) => f.key));
      const base = `${src.key}_copy`;
      const key = uniqKey(base, used);

      const idx = fields.findIndex((f) => f.id === fieldId);
      const insertIndex = idx >= 0 ? idx + 1 : fields.length;

      const created = await createField(formId, {
        key,
        label: `${src.label} (copy)`,
        type: src.type,
        required: src.required,
        isActive: src.isActive,
        placeholder: src.placeholder,
        helpText: src.helpText,
        config: src.config,
      });

      if (!created.ok) {
        setState({
          status: "error",
          message: created.message || "Couldn’t duplicate.",
          traceId: safeTraceId(created.traceId),
        });
        return;
      }

      const next = insertAt(fields, insertIndex, created.data);
      setFields(next);
      setOpenFieldId(created.data.id);
      await persistOrder(next);
      showFlash("Field duplicated.");
    },
    [fields, formId, persistOrder, showFlash]
  );

  const onDelete = React.useCallback(
    async (fieldId: string) => {
      const f = fields.find((x) => x.id === fieldId);
      if (!f) return;
      if (isSystemField(f)) return;

      const del = await deleteField(formId, fieldId);
      if (!del.ok) {
        setState({
          status: "error",
          message: del.message || "Couldn’t delete.",
          traceId: safeTraceId(del.traceId),
        });
        return;
      }

      const next = fields.filter((x) => x.id !== fieldId);
      setFields(next);
      if (openFieldId === fieldId) setOpenFieldId(null);

      await persistOrder(next);
      showFlash("Field deleted.");
    },
    [fields, formId, openFieldId, persistOrder, showFlash]
  );

  const onPatchField = React.useCallback(
    async (fieldId: string, patch: Parameters<typeof patchField>[2]) => {
      const res = await patchField(formId, fieldId, patch);
      if (!res.ok) {
        setState({
          status: "error",
          message: res.message || "Couldn’t save.",
          traceId: safeTraceId(res.traceId),
        });
        return;
      }

      setFields((cur) => cur.map((f) => (f.id === fieldId ? res.data : f)));
    },
    [formId]
  );

  const onPatchFormBasics = React.useCallback(
    async (body: { name?: string; description?: string | null; configPatch?: Record<string, unknown> }) => {
      const res = await patchFormBasics(formId, body);
      if (!res.ok) {
        setState({
          status: "error",
          message: res.message || "Couldn’t save form.",
          traceId: safeTraceId(res.traceId),
        });
        return;
      }

      setFormName(res.data.name);
      setFormDescription(res.data.description ?? null);
      setFormStatus(res.data.status);
      setFormConfig(res.data.config ?? null);
      setFields(res.data.fields);
      showFlash("Saved.");
    },
    [formId, showFlash]
  );

  const onPatchFormStatus = React.useCallback(
    async (status: "DRAFT" | "ACTIVE" | "ARCHIVED") => {
      const res = await patchFormStatus(formId, status);
      if (!res.ok) {
        setState({
          status: "error",
          message: res.message || "Couldn’t update status.",
          traceId: safeTraceId(res.traceId),
        });
        return;
      }
      setFormStatus(res.data.status);
      showFlash("Status updated.");
    },
    [formId, showFlash]
  );

  const onDragStart = React.useCallback((ev: DragStartEvent) => {
    const data = ev.active.data.current as ActiveData | undefined;
    if (!data) {
      setActiveDrag({ kind: "none" });
      return;
    }

    if (data.kind === "library") {
      setActiveDrag({ kind: "library", item: data.item });
      return;
    }

    if (data.kind === "field") {
      setActiveDrag({ kind: "field", fieldId: data.fieldId });
      return;
    }

    setActiveDrag({ kind: "none" });
  }, []);

  const onDragCancel = React.useCallback(() => {
    setActiveDrag({ kind: "none" });
  }, []);

  function idToString(id: UniqueIdentifier | null | undefined): string {
    if (id === null || id === undefined) return "";
    return String(id);
  }

  const onDragEnd = React.useCallback(
    async (ev: DragEndEvent) => {
      const activeId = idToString(ev.active?.id);
      const overId = idToString(ev.over?.id);

      // add from library
      const data = ev.active.data.current as ActiveData | undefined;
      if (data?.kind === "library") {
        if (!overId) {
          setActiveDrag({ kind: "none" });
          return;
        }

        let insertIndex = fields.length;
        if (overId !== "canvas") {
          const idx = fields.findIndex((f) => f.id === overId);
          if (idx >= 0) insertIndex = idx;
        }

        await addFromLibrary(data.item, insertIndex);
        setActiveDrag({ kind: "none" });
        return;
      }

      // reorder fields
      if (activeId && overId && activeId !== overId) {
        const aIdx = fields.findIndex((f) => f.id === activeId);
        const oIdx = fields.findIndex((f) => f.id === overId);
        if (aIdx >= 0 && oIdx >= 0) {
          await onReorder(activeId, overId);
        }
      }

      setActiveDrag({ kind: "none" });
    },
    [addFromLibrary, fields, onReorder]
  );

  if (state.status === "loading") {
    return <div className="lr-muted">Loading builder…</div>;
  }

  if (state.status === "error") {
    return (
      <div className="lr-page">
        <div className="lr-pageHeader">
          <h1 className="lr-h1">Builder</h1>
          <p className="lr-muted">
            {state.message}{" "}
            <span className="lr-meta">
              Trace: <span className="lr-mono">{state.traceId}</span>
            </span>
          </p>
          <div className="lr-actions">
            <button className="lr-btnSecondary" onClick={() => void load()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const draggingLabel =
    activeDrag.kind === "library"
      ? activeDrag.item.title
      : activeDrag.kind === "field"
      ? fields.find((f) => f.id === activeDrag.fieldId)?.label ?? "Field"
      : null;

  return (
    <div className="lr-page" style={{ gap: 12 }}>
      {flash ? (
        <div className="lr-flash" role="status" aria-live="polite">
          {flash}
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragCancel={onDragCancel}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-3" style={{ minHeight: "70vh" }}>
          <div className="w-[320px] shrink-0">
            <FieldLibrary
              items={LIB_ITEMS}
              onQuickAdd={(it) => void addFromLibrary(it, fields.length)}
              onQuickAddMany={(its) => void addManyFromLibrary(its, fields.length)}
            />
          </div>

          <div className="min-w-0 flex-1">
            <Canvas
              formId={formId}
              fields={fields}
              openFieldId={openFieldId}
              onToggleOpen={onToggleOpen}
              onDuplicate={(id) => void onDuplicate(id)}
              onDelete={(id) => void onDelete(id)}
              onPatchField={(id, patch) => void onPatchField(id, patch)}
            />
          </div>

          <div className="w-[340px] shrink-0">
            <FormSettingsPanel
              formId={formId}
              name={formName}
              description={formDescription}
              status={formStatus}
              config={formConfig}
              onPatchBasics={(b) => void onPatchFormBasics(b)}
              onPatchStatus={(s) => void onPatchFormStatus(s)}
            />
          </div>
        </div>

        <DragOverlay>
          {draggingLabel ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
              {draggingLabel}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
