"use client";

import * as React from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import AddFieldModal from "./build/AddFieldModal";

import type { FormDetail, FormField, FormStatus } from "../../formDetail.types";
import type { BuilderSaveState, BuilderStep, FieldDraft, FieldType } from "../../_lib/builderV2.types";
import { fieldTypeLabel } from "../../_lib/builderV2.types";

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function saveStateLabel(s: BuilderSaveState) {
  switch (s) {
    case "saved":
      return "All changes saved";
    case "dirty":
      return "Unsaved changes…";
    case "saving":
      return "Saving…";
    case "error":
      return "Save error";
    default:
      return "";
  }
}

function stepLabel(s: BuilderStep) {
  switch (s) {
    case "build":
      return "Build";
    case "design":
      return "Design";
    case "publish":
      return "Publish";
    default:
      return "Build";
  }
}

function StepTabs({ value, onChange }: { value: BuilderStep; onChange: (v: BuilderStep) => void }) {
  const steps: BuilderStep[] = ["build", "design", "publish"];
  return (
    <div className="inline-flex rounded-xl border bg-white p-1">
      {steps.map((s) => {
        const active = s === value;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-sm",
              active ? "bg-black text-white" : "text-gray-700 hover:bg-gray-50"
            )}
          >
            {stepLabel(s)}
          </button>
        );
      })}
    </div>
  );
}

type SortableAttributes = ReturnType<typeof useSortable>["attributes"];
type SortableListeners = ReturnType<typeof useSortable>["listeners"];

function DragHandle({
  disabled,
  attributes,
  listeners,
  active,
}: {
  disabled: boolean;
  attributes: SortableAttributes;
  listeners: SortableListeners;
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

function FieldCard({
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
          "rounded-2xl border bg-white p-4 shadow-sm transition",
          selected ? "border-gray-900 ring-1 ring-black/5" : "border-gray-200 hover:border-gray-300"
        )}
      >
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseSelectOptionsFromConfig(config: unknown): string[] {
  if (!isRecord(config)) return [];
  const raw = (config.options ?? config.selectOptions) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x))
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSelectOptionsFromText(optionsText: string): string[] {
  return String(optionsText || "")
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ensureOptionsTextNonEmpty(v: string): string {
  const t = String(v || "").trim();
  return t ? v : "Option 1";
}

function FieldPreview({
  field,
  disabled,
}: {
  field: {
    id: string;
    key: string;
    label: string;
    type: FieldType;
    required: boolean;
    isActive: boolean;
    placeholder: string;
    helpText: string;
    config?: unknown;
    checkboxDefault?: boolean;
    optionsText?: string;
  };
  disabled: boolean;
}) {
  const t = field.type;
  const req = field.required ? " *" : "";

  const commonLabel = (
    <label className="mb-1 block text-sm font-medium text-gray-900">
      {field.label}
      <span className="text-gray-400">{req}</span>
    </label>
  );

  if (t === "TEXTAREA") {
    return (
      <div className="space-y-1">
        {commonLabel}
        <textarea
          disabled
          className={clsx(
            "min-h-[96px] w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900",
            disabled && "opacity-60"
          )}
          placeholder={field.placeholder || ""}
          defaultValue=""
        />
        {field.helpText ? <div className="text-xs text-gray-500">{field.helpText}</div> : null}
      </div>
    );
  }

  if (t === "SINGLE_SELECT" || t === "MULTI_SELECT") {
    const optsFromDraft = field.optionsText ? parseSelectOptionsFromText(field.optionsText) : [];
    const optsFromCfg = parseSelectOptionsFromConfig(field.config);
    const opts =
      (optsFromDraft.length > 0 ? optsFromDraft : optsFromCfg).length > 0
        ? optsFromDraft.length > 0
          ? optsFromDraft
          : optsFromCfg
        : ["Option 1"];

    return (
      <div className="space-y-1">
        {commonLabel}
        <select
          disabled
          multiple={t === "MULTI_SELECT"}
          className={clsx(
            "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900",
            disabled && "opacity-60"
          )}
          value={t === "MULTI_SELECT" ? [] : ""}
          onChange={() => void 0}
        >
          {t === "SINGLE_SELECT" ? <option value="">—</option> : null}
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {field.helpText ? <div className="text-xs text-gray-500">{field.helpText}</div> : null}
      </div>
    );
  }

  if (t === "CHECKBOX") {
    const checked = Boolean(field.checkboxDefault);
    return (
      <div className="space-y-1">
        <label className={clsx("flex items-center gap-2 text-sm text-gray-900", disabled && "opacity-60")}>
          <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={checked} readOnly disabled />
          <span className="font-medium">
            {field.label}
            <span className="text-gray-400">{req}</span>
          </span>
        </label>
        {field.helpText ? <div className="text-xs text-gray-500">{field.helpText}</div> : null}
      </div>
    );
  }

  const htmlType = t === "EMAIL" ? "email" : t === "PHONE" ? "tel" : "text";

  return (
    <div className="space-y-1">
      {commonLabel}
      <input
        disabled
        className={clsx(
          "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900",
          disabled && "opacity-60"
        )}
        type={htmlType}
        placeholder={field.placeholder || ""}
        defaultValue=""
      />
      {field.helpText ? <div className="text-xs text-gray-500">{field.helpText}</div> : null}
    </div>
  );
}

function FormPreviewPanel({
  title,
  fields,
  disabled,
}: {
  title: string;
  fields: Array<{
    id: string;
    key: string;
    label: string;
    type: FieldType;
    required: boolean;
    isActive: boolean;
    placeholder: string;
    helpText: string;
    config?: unknown;
    checkboxDefault?: boolean;
    optionsText?: string;
  }>;
  disabled: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="mt-1 text-xs text-gray-500">Realistische Vorschau (read-only).</div>
        </div>
      </div>

      {fields.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">Keine Felder.</div>
      ) : (
        <div className="space-y-4">
          {fields.map((f) => (
            <FieldPreview key={f.id} field={f} disabled={disabled} />
          ))}
        </div>
      )}
    </div>
  );
}

function Inspector({
  draft,
  saveState,
  saveErr,
  saveTraceId,
  onDraftPatch,
}: {
  draft: FieldDraft | null;
  saveState: BuilderSaveState;
  saveErr: string | null;
  saveTraceId: string | null;
  onDraftPatch: (patch: Partial<FieldDraft>) => void;
}) {
  if (!draft) {
    return (
      <div className="rounded-2xl border bg-white p-5">
        <div className="text-sm font-semibold text-gray-900">Properties</div>
        <div className="mt-2 text-sm text-gray-500">Select a field to edit its settings.</div>
      </div>
    );
  }

  const isSelect = draft.type === "SINGLE_SELECT" || draft.type === "MULTI_SELECT";
  const isCheckbox = draft.type === "CHECKBOX";

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Properties</div>
          <div className="mt-1 text-xs text-gray-500">{saveStateLabel(saveState)}</div>
        </div>
      </div>

      {saveErr ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <div className="font-medium">{saveErr}</div>
          {saveTraceId ? <div className="mt-1 text-xs text-red-700/80">traceId: {saveTraceId}</div> : null}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <div>
          <div className="text-xs font-medium text-gray-700">Label</div>
          <input
            value={draft.label}
            onChange={(e) => onDraftPatch({ label: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
          />
        </div>

        <div>
          <div className="text-xs font-medium text-gray-700">Key</div>
          <input
            value={draft.key}
            onChange={(e) => onDraftPatch({ key: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-black/10"
          />
          <div className="mt-1 text-xs text-gray-500">Internal identifier (must be unique).</div>
        </div>

        <div>
          <div className="text-xs font-medium text-gray-700">Type</div>
          <select
            value={draft.type}
            onChange={(e) => {
              const nextType = e.target.value as FieldType;

              if (nextType === "SINGLE_SELECT" || nextType === "MULTI_SELECT") {
                const nextOptionsText = ensureOptionsTextNonEmpty(draft.optionsText);
                onDraftPatch({ type: nextType, optionsText: nextOptionsText });
                return;
              }

              onDraftPatch({ type: nextType });
            }}
            className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
          >
            <option value="TEXT">Text</option>
            <option value="TEXTAREA">Textarea</option>
            <option value="EMAIL">Email</option>
            <option value="PHONE">Phone</option>
            <option value="SINGLE_SELECT">Select (single)</option>
            <option value="MULTI_SELECT">Select (multi)</option>
            <option value="CHECKBOX">Checkbox</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="req"
            type="checkbox"
            checked={draft.required}
            onChange={(e) => onDraftPatch({ required: e.target.checked })}
          />
          <label htmlFor="req" className="text-sm text-gray-700">
            Required
          </label>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="active"
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => onDraftPatch({ isActive: e.target.checked })}
          />
          <label htmlFor="active" className="text-sm text-gray-700">
            Active
          </label>
        </div>

        <div>
          <div className="text-xs font-medium text-gray-700">Placeholder</div>
          <input
            value={draft.placeholder}
            onChange={(e) => onDraftPatch({ placeholder: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
          />
        </div>

        <div>
          <div className="text-xs font-medium text-gray-700">Help text</div>
          <textarea
            value={draft.helpText}
            onChange={(e) => onDraftPatch({ helpText: e.target.value })}
            className="mt-1 w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
            rows={3}
          />
        </div>

        {isSelect ? (
          <div>
            <div className="text-xs font-medium text-gray-700">Options (one per line)</div>
            <textarea
              value={draft.optionsText}
              onChange={(e) => onDraftPatch({ optionsText: e.target.value })}
              onBlur={() => {
                const next = ensureOptionsTextNonEmpty(draft.optionsText);
                if (next !== draft.optionsText) onDraftPatch({ optionsText: next });
              }}
              className="mt-1 w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              rows={6}
            />
          </div>
        ) : null}

        {isCheckbox ? (
          <div className="flex items-center gap-2">
            <input
              id="cbdefault"
              type="checkbox"
              checked={draft.checkboxDefault}
              onChange={(e) => onDraftPatch({ checkboxDefault: e.target.checked })}
            />
            <label htmlFor="cbdefault" className="text-sm text-gray-700">
              Default checked
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function BuilderV2(props: {
  form: FormDetail;
  fields: FormField[];

  selectedId: string;
  onSelect: (id: string) => void;

  showInactive: boolean;
  onToggleShowInactive: (v: boolean) => void;

  draft: FieldDraft | null;
  onDraftPatch: (patch: Partial<FieldDraft>) => void;

  saveState: BuilderSaveState;
  saveErr: string | null;
  saveTraceId: string | null;

  onAddField: (input?: { label?: string; type?: FieldType }) => void;
  onDuplicateField: (id: string) => void;
  onDeleteField: (id: string) => void;

  onPatchFieldFlags: (id: string, patch: { required?: boolean; isActive?: boolean }) => void;

  onReorderVisible: (nextVisibleOrderIds: string[], visibleIds: string[]) => void;

  statusBusy: boolean;
  onSetStatus: (s: FormStatus) => void;
}) {
  const [step, setStep] = React.useState<BuilderStep>("build");
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

  const statuses: FormStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

  const previewFields = React.useMemo(() => {
    return visibleFields.map((f) => {
      const base = {
        id: f.id,
        key: String(f.key ?? ""),
        label: String(f.label ?? f.key ?? ""),
        type: String(f.type ?? "TEXT").toUpperCase() as FieldType,
        required: Boolean(f.required),
        isActive: Boolean(f.isActive),
        placeholder: String(f.placeholder ?? ""),
        helpText: String(f.helpText ?? ""),
        config: f.config ?? undefined,
      };

      if (props.draft && props.selectedId === f.id) {
        const d = props.draft;
        const merged = {
          ...base,
          key: d.key,
          label: d.label,
          type: d.type,
          required: d.required,
          isActive: d.isActive,
          placeholder: d.placeholder,
          helpText: d.helpText,
          checkboxDefault: d.checkboxDefault,
          optionsText: d.optionsText,
        };

        if (merged.type === "SINGLE_SELECT" || merged.type === "MULTI_SELECT") {
          merged.optionsText = ensureOptionsTextNonEmpty(merged.optionsText ?? "");
        }

        return merged;
      }

      return base;
    });
  }, [visibleFields, props.draft, props.selectedId]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <StepTabs value={step} onChange={setStep} />
            <div className="text-sm text-gray-500">{saveStateLabel(props.saveState)}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {step === "build" ? (
              <>
                <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={props.showInactive}
                    onChange={(e) => props.onToggleShowInactive(e.target.checked)}
                  />
                  Show inactive
                </label>

                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-black/90"
                >
                  Add field
                </button>
              </>
            ) : null}

            {step === "publish" ? (
              <div className="flex items-center gap-2">
                <div className="text-sm text-gray-500">Status</div>
                <select
                  value={props.form.status}
                  onChange={(e) => void props.onSetStatus(e.target.value as FormStatus)}
                  disabled={props.statusBusy}
                  className="rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 disabled:opacity-50"
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {step === "build" ? (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr_360px]">
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
                  <div className="space-y-3">
                    {visibleFields.map((f) => (
                      <FieldCard
                        key={f.id}
                        field={f}
                        selected={f.id === props.selectedId}
                        disabled={props.saveState === "saving"}
                        onSelect={() => props.onSelect(f.id)}
                        onDuplicate={() => props.onDuplicateField(f.id)}
                        onDelete={() => props.onDeleteField(f.id)}
                        onToggleRequired={() => props.onPatchFieldFlags(f.id, { required: !Boolean(f.required) })}
                        onToggleActive={() => props.onPatchFieldFlags(f.id, { isActive: !Boolean(f.isActive) })}
                      />
                    ))}

                    <button
                      type="button"
                      onClick={() => setAddOpen(true)}
                      className="w-full rounded-2xl border border-dashed px-4 py-4 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      + Add field
                    </button>
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          <FormPreviewPanel title="Preview" fields={previewFields} disabled={props.saveState === "saving"} />

          <Inspector
            draft={props.draft}
            saveState={props.saveState}
            saveErr={props.saveErr}
            saveTraceId={props.saveTraceId}
            onDraftPatch={props.onDraftPatch}
          />
        </div>
      ) : step === "design" ? (
        <div className="rounded-2xl border bg-white p-6">
          <div className="text-lg font-semibold">Design</div>
          <div className="mt-2 text-sm text-gray-600">Coming soon (Phase 1). In TP 2.7 halten wir es bewusst schlank.</div>
        </div>
      ) : (
        <div className="rounded-2xl border bg-white p-6">
          <div className="text-lg font-semibold">Publish</div>
          <div className="mt-2 text-sm text-gray-600">
            Setze den Status auf <span className="font-medium">ACTIVE</span>, sobald dein Formular bereit ist.
          </div>
          <div className="mt-4 rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">
            Guardrail: <span className="font-medium">ACTIVE</span> benötigt mindestens{" "}
            <span className="font-medium">1 Active Field</span>.
          </div>
        </div>
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
