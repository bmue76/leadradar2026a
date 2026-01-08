"use client";

import * as React from "react";
import { adminFetchJson } from "../../../_lib/adminFetch";
import { parseCheckboxDefault, parseOptions } from "./fieldConfig";

import type { ApiResponse, FormDetail, FormField, FormStatus } from "../formDetail.types";
import type { BuilderSaveState, FieldDraft, FieldType, ToastState } from "./builderV2.types";

type InlineError = { message: string; code?: string; traceId?: string } | null;

type UnknownRecord = Record<string, unknown>;
function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getErrMessage(res: unknown): { message: string; code?: string; traceId?: string } {
  if (isRecord(res)) {
    const traceId = typeof res.traceId === "string" ? res.traceId : undefined;

    if (res.ok === false && isRecord(res.error)) {
      const msg = typeof res.error.message === "string" ? res.error.message : "Request failed.";
      const code = typeof res.error.code === "string" ? res.error.code : undefined;
      return { message: msg, code, traceId };
    }

    const msg2 =
      typeof res.message === "string"
        ? res.message
        : typeof res.error === "string"
          ? res.error
          : "Request failed.";
    return { message: msg2, traceId };
  }

  return { message: "Request failed." };
}

async function api<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    return (await adminFetchJson(path, init)) as ApiResponse<T>;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network error.";
    return { ok: false, error: { code: "NETWORK_ERROR", message: msg }, traceId: "no-trace-id" } as ApiResponse<T>;
  }
}

function sortFieldsStable(fields: FormField[]) {
  return [...fields].sort((a, b) => {
    const ao = typeof a.sortOrder === "number" ? a.sortOrder : 0;
    const bo = typeof b.sortOrder === "number" ? b.sortOrder : 0;
    if (ao !== bo) return ao - bo;
    // tie-breaker only (should be rare once reorder assigns unique sortOrder)
    return String(a.label || "").localeCompare(String(b.label || ""));
  });
}

function uniq(xs: string[]) {
  return Array.from(new Set(xs));
}

function coerceFieldType(v: unknown): FieldType {
  const u = String(v || "").toUpperCase();
  switch (u) {
    case "TEXT":
    case "TEXTAREA":
    case "SINGLE_SELECT":
    case "MULTI_SELECT":
    case "EMAIL":
    case "PHONE":
    case "CHECKBOX":
      return u as FieldType;
    default:
      return "TEXT";
  }
}

function deriveDraftFromField(f: FormField): FieldDraft {
  const type = coerceFieldType(f.type);
  const options = parseOptions(f.config);
  const checkboxDefault = parseCheckboxDefault(f.config);

  return {
    key: f.key,
    label: f.label,
    type,
    required: Boolean(f.required),
    isActive: Boolean(f.isActive),
    placeholder: f.placeholder ?? "",
    helpText: f.helpText ?? "",
    optionsText: options.join("\n"),
    checkboxDefault,
  };
}

type CreateFieldInput = {
  label?: string;
  type?: FieldType;
  required?: boolean;
  isActive?: boolean;
  placeholder?: string;
  helpText?: string;
  config?: unknown;
  keyHint?: string;
};

export function useFormDetail(formId: string) {
  const mountedRef = React.useRef(true);

  const [loading, setLoading] = React.useState(true);
  const [loadErr, setLoadErr] = React.useState<InlineError>(null);
  const [form, setForm] = React.useState<FormDetail | null>(null);

  const [toast, setToast] = React.useState<ToastState>(null);
  const toastTimerRef = React.useRef<number | null>(null);

  const [statusBusy, setStatusBusy] = React.useState(false);

  const [order, setOrder] = React.useState<string[]>([]);
  const orderRef = React.useRef<string[]>([]);
  React.useEffect(() => {
    orderRef.current = order;
  }, [order]);

  const [orderDirty, _setOrderDirty] = React.useState(false);
  const orderDirtyRef = React.useRef(false);
  function setOrderDirty(v: boolean) {
    orderDirtyRef.current = v;
    _setOrderDirty(v);
  }

  const [showInactive, setShowInactive] = React.useState(false);

  const [selectedId, setSelectedId] = React.useState<string>("");

  const [draft, setDraft] = React.useState<FieldDraft | null>(null);

  const [saveState, setSaveState] = React.useState<BuilderSaveState>("saved");
  const [saveErr, setSaveErr] = React.useState<string | null>(null);
  const [saveTraceId, setSaveTraceId] = React.useState<string | null>(null);

  const pendingOpsRef = React.useRef(0);
  const fieldSaveTimerRef = React.useRef<number | null>(null);
  const orderSaveTimerRef = React.useRef<number | null>(null);

  const lastDeletedRef = React.useRef<{
    snapshot: FormField;
    index: number;
  } | null>(null);

  function beginSave() {
    pendingOpsRef.current += 1;
    setSaveState("saving");
  }
  function endSaveSuccess() {
    pendingOpsRef.current = Math.max(0, pendingOpsRef.current - 1);
    if (pendingOpsRef.current === 0) setSaveState("saved");
  }
  function endSaveError() {
    pendingOpsRef.current = Math.max(0, pendingOpsRef.current - 1);
    setSaveState("error");
  }

  function clearToastTimer() {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
  }

  function showToast(t: ToastState, autoMs?: number) {
    clearToastTimer();
    setToast(t);
    if (autoMs && autoMs > 0) {
      toastTimerRef.current = window.setTimeout(() => mountedRef.current && setToast(null), autoMs);
    }
  }

  function dismissToast() {
    clearToastTimer();
    setToast(null);
  }

  const fieldsSorted = React.useMemo(() => sortFieldsStable(form?.fields || []), [form?.fields]);
  const fieldsById = React.useMemo(() => new Map((form?.fields || []).map((f) => [f.id, f])), [form?.fields]);

  const fieldsOrdered = React.useMemo(() => {
    if (!form) return [];
    const existing = new Set((form.fields || []).map((f) => f.id));

    const normalized = [
      ...order.filter((id) => existing.has(id)),
      ...fieldsSorted.map((f) => f.id).filter((id) => !order.includes(id)),
    ];

    return normalized.map((id) => fieldsById.get(id)).filter(Boolean) as FormField[];
  }, [form, order, fieldsById, fieldsSorted]);

  const selected = React.useMemo(
    () => fieldsOrdered.find((f) => f.id === selectedId) || null,
    [fieldsOrdered, selectedId]
  );

  // IMPORTANT:
  // refresh() must NOT clobber order when orderDirty=true (e.g. while reorder save is in-flight).
  const refresh = React.useCallback(
    async (preferSelectedId?: string): Promise<FormDetail | null> => {
      setLoading(true);
      setLoadErr(null);

      const res = await api<FormDetail>(`/api/admin/v1/forms/${formId}`, { method: "GET" });

      if (!mountedRef.current) return null;

      if (!res.ok) {
        setForm(null);
        setOrder([]);
        setOrderDirty(false);
        setSelectedId("");
        setDraft(null);

        const err = getErrMessage(res);
        setLoadErr({ message: err.message, code: err.code, traceId: err.traceId });
        setLoading(false);
        return null;
      }

      const nextForm = res.data;
      setForm(nextForm);

      const serverOrder = sortFieldsStable(nextForm.fields || []).map((f) => f.id);

      // Preserve local order if user has a pending local reorder.
      setOrder((prev) => {
        if (orderDirtyRef.current) {
          const existing = new Set(serverOrder);
          const merged = [
            ...prev.filter((id) => existing.has(id)),
            ...serverOrder.filter((id) => !prev.includes(id)),
          ];
          return uniq(merged);
        }
        return serverOrder;
      });

      if (!orderDirtyRef.current) {
        setOrderDirty(false);
      }

      const desired =
        preferSelectedId && nextForm.fields.some((f) => f.id === preferSelectedId)
          ? preferSelectedId
          : selectedId && nextForm.fields.some((f) => f.id === selectedId)
            ? selectedId
            : nextForm.fields[0]?.id || "";

      setSelectedId(desired);

      setLoading(false);
      return nextForm;
    },
    [formId, selectedId]
  );

  React.useEffect(() => {
    mountedRef.current = true;
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(t);
      clearToastTimer();
      if (fieldSaveTimerRef.current) window.clearTimeout(fieldSaveTimerRef.current);
      if (orderSaveTimerRef.current) window.clearTimeout(orderSaveTimerRef.current);
    };
  }, [refresh]);

  React.useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft(deriveDraftFromField(selected));
    setSaveErr(null);
    setSaveTraceId(null);
    setSaveState("saved");
    if (fieldSaveTimerRef.current) window.clearTimeout(fieldSaveTimerRef.current);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleFieldAutosave() {
    if (fieldSaveTimerRef.current) window.clearTimeout(fieldSaveTimerRef.current);
    fieldSaveTimerRef.current = window.setTimeout(() => {
      void saveSelectedField();
    }, 700);
  }

  function scheduleOrderAutosave() {
    if (orderSaveTimerRef.current) window.clearTimeout(orderSaveTimerRef.current);
    orderSaveTimerRef.current = window.setTimeout(() => {
      void saveOrder();
    }, 700);
  }

  function setDraftPatch(patch: Partial<FieldDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaveState("dirty");
    scheduleFieldAutosave();
  }

  async function setStatus(next: FormStatus) {
    if (!form) return;

    if (next === "ACTIVE") {
      const activeCount = (form.fields || []).filter((f) => Boolean(f.isActive)).length;
      if (activeCount < 1) {
        showToast({ message: "Cannot activate: add at least 1 active field." }, 3000);
        return;
      }
    }

    setStatusBusy(true);

    const res = await api<FormDetail>(`/api/admin/v1/forms/${formId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });

    if (!mountedRef.current) return;

    setStatusBusy(false);

    if (!res.ok) {
      const err = getErrMessage(res);
      showToast({ message: `Status error: ${err.message}` }, 3000);
      return;
    }

    await refresh();
    showToast({ message: "Status updated." }, 2000);
  }

  async function createField(input?: CreateFieldInput) {
    if (!form) return;

    const key = (input?.keyHint?.trim() || `field_${Date.now()}`).trim();
    const type = input?.type ?? "TEXT";

    const ph = (input?.placeholder ?? "").trim();
    const ht = (input?.helpText ?? "").trim();

    const payload: Record<string, unknown> = {
      key,
      label: input?.label?.trim() || "New field",
      type,
      required: Boolean(input?.required ?? false),
      isActive: Boolean(input?.isActive ?? true),
      placeholder: ph.length ? ph : null,
      helpText: ht.length ? ht : null,
      config: input?.config ?? null,
    };

    beginSave();
    setSaveErr(null);
    setSaveTraceId(null);

    const res = await api<unknown>(`/api/admin/v1/forms/${form.id}/fields`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!mountedRef.current) return;

    if (!res.ok) {
      const err = getErrMessage(res);
      setSaveErr(err.message || "Could not create field.");
      setSaveTraceId(err.traceId || null);
      endSaveError();
      return;
    }

    const next = await refresh();
    endSaveSuccess();

    const created = next?.fields?.find((f) => f.key === key);
    if (created?.id) {
      setSelectedId(created.id);
      showToast({ message: "Field added." }, 2000);
    }
  }

  async function duplicateField(id: string) {
    if (!form) return;
    const src = (form.fields || []).find((f) => f.id === id);
    if (!src) return;

    const now = Date.now();
    const key = `${src.key}_copy_${now}`;

    const payload: Record<string, unknown> = {
      key,
      label: `${src.label} (copy)`,
      type: coerceFieldType(src.type),
      required: Boolean(src.required),
      isActive: Boolean(src.isActive),
      placeholder: src.placeholder ?? null,
      helpText: src.helpText ?? null,
      config: src.config ?? null,
    };

    beginSave();

    const res = await api<unknown>(`/api/admin/v1/forms/${form.id}/fields`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!mountedRef.current) return;

    if (!res.ok) {
      const err = getErrMessage(res);
      setSaveErr(err.message || "Could not duplicate field.");
      setSaveTraceId(err.traceId || null);
      endSaveError();
      return;
    }

    const next = await refresh();
    endSaveSuccess();

    const created = next?.fields?.find((f) => f.key === key);
    if (created?.id) setSelectedId(created.id);

    showToast({ message: "Field duplicated." }, 2200);
  }

  async function deleteField(id: string) {
    if (!form) return;

    const snapshot = (form.fields || []).find((f) => f.id === id) || null;
    if (!snapshot) return;

    const ok = window.confirm(`Delete field "${snapshot.label}"?\n\nThis cannot be undone.`);
    if (!ok) return;

    beginSave();

    const idx = fieldsOrdered.findIndex((f) => f.id === id);
    lastDeletedRef.current = { snapshot, index: Math.max(0, idx) };

    const res = await api<FormDetail>(`/api/admin/v1/forms/${formId}/fields/${id}`, { method: "DELETE" });

    if (!mountedRef.current) return;

    if (!res.ok) {
      const err = getErrMessage(res);
      setSaveErr(err.message || "Could not delete field.");
      setSaveTraceId(err.traceId || null);
      endSaveError();
      return;
    }

    await refresh();
    endSaveSuccess();

    showToast({ message: "Field deleted.", actionLabel: "Undo", actionId: "undoDelete" }, 8000);
  }

  async function undoDelete() {
    if (!form) return;
    const last = lastDeletedRef.current;
    if (!last) return;

    const s = last.snapshot;

    beginSave();
    dismissToast();

    const payload: Record<string, unknown> = {
      key: s.key,
      label: s.label,
      type: coerceFieldType(s.type),
      required: Boolean(s.required),
      isActive: Boolean(s.isActive),
      placeholder: s.placeholder ?? null,
      helpText: s.helpText ?? null,
      config: s.config ?? null,
    };

    const res = await api<unknown>(`/api/admin/v1/forms/${form.id}/fields`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!mountedRef.current) return;

    if (!res.ok) {
      const err = getErrMessage(res);
      setSaveErr(err.message || "Could not undo delete.");
      setSaveTraceId(err.traceId || null);
      endSaveError();
      return;
    }

    const next = await refresh();
    const recreated = next?.fields?.find((f) => f.key === s.key);

    if (recreated?.id) {
      const ids = sortFieldsStable(next?.fields || []).map((f) => f.id);
      const without = ids.filter((x) => x !== recreated.id);
      const insertAt = Math.min(last.index, without.length);
      without.splice(insertAt, 0, recreated.id);
      setOrder(without);
      setOrderDirty(true);
      scheduleOrderAutosave();
      setSelectedId(recreated.id);
    }

    endSaveSuccess();
    showToast({ message: "Undo successful." }, 2200);

    lastDeletedRef.current = null;
  }

  async function runToastAction(actionId: "undoDelete") {
    if (actionId === "undoDelete") await undoDelete();
  }

  function reorderVisible(nextVisibleOrderIds: string[], visibleIds: string[]) {
    const nextVisible = uniq(nextVisibleOrderIds);
    const visibleSet = new Set(visibleIds);

    setOrder((prev) => {
      const positions: number[] = [];
      prev.forEach((id, idx) => {
        if (visibleSet.has(id)) positions.push(idx);
      });

      const nextOrder = [...prev];
      for (let i = 0; i < positions.length; i++) {
        nextOrder[positions[i]] = nextVisible[i] ?? nextOrder[positions[i]];
      }
      return uniq(nextOrder);
    });

    setOrderDirty(true);
    setSaveState("dirty");
    scheduleOrderAutosave();
  }

  async function saveOrder() {
    if (!form) return;

    const currentOrder = orderRef.current;

    const existing = new Set((form.fields || []).map((f) => f.id));
    const normalized = [
      ...currentOrder.filter((id) => existing.has(id)),
      ...fieldsSorted.map((f) => f.id).filter((id) => !currentOrder.includes(id)),
    ];

    beginSave();
    setSaveErr(null);
    setSaveTraceId(null);

    const res = await api<unknown>(`/api/admin/v1/forms/${formId}/fields/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order: normalized }),
    });

    if (!mountedRef.current) return;

    if (!res.ok) {
      const err = getErrMessage(res);
      setSaveErr(`Order error: ${err.message}`);
      setSaveTraceId(err.traceId || null);
      endSaveError();
      return;
    }

    // ✅ Optimistic apply: avoid refresh() clobber / "jump back"
    setOrder(normalized);
    setOrderDirty(false);

    // keep form.fields sortOrder in sync locally (nice-to-have)
    setForm((prev) => {
      if (!prev) return prev;
      const map = new Map<string, number>();
      normalized.forEach((id, idx) => map.set(id, (idx + 1) * 10));
      return {
        ...prev,
        fields: (prev.fields || []).map((f) => ({
          ...f,
          sortOrder: map.get(f.id) ?? (typeof f.sortOrder === "number" ? f.sortOrder : 0),
        })),
      };
    });

    endSaveSuccess();
  }

  async function patchFieldFlags(id: string, patch: { required?: boolean; isActive?: boolean }) {
    if (!form) return;

    const f = (form.fields || []).find((x) => x.id === id);
    if (!f) return;

    const payload: Record<string, unknown> = {
      key: f.key,
      label: f.label,
      type: coerceFieldType(f.type),
      required: typeof patch.required === "boolean" ? patch.required : Boolean(f.required),
      isActive: typeof patch.isActive === "boolean" ? patch.isActive : Boolean(f.isActive),
      placeholder: f.placeholder ?? null,
      helpText: f.helpText ?? null,
      config: f.config ?? null,
    };

    beginSave();
    setSaveErr(null);
    setSaveTraceId(null);

    const res = await api<unknown>(`/api/admin/v1/forms/${form.id}/fields/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!mountedRef.current) return;

    if (!res.ok) {
      const err = getErrMessage(res);
      setSaveErr(err.message || "Could not update field.");
      setSaveTraceId(err.traceId || null);
      endSaveError();
      return;
    }

    // refresh is ok, but must not clobber order while orderDirty=true
    await refresh(id);
    endSaveSuccess();
  }

  async function saveSelectedField() {
    if (!form || !selected || !draft) return;

    beginSave();
    setSaveErr(null);
    setSaveTraceId(null);

    const type = draft.type;

    let config: unknown = null;
    if (type === "SINGLE_SELECT" || type === "MULTI_SELECT") {
      const options = draft.optionsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      config = { options };
    } else if (type === "CHECKBOX") {
      config = { defaultValue: Boolean(draft.checkboxDefault) };
    }

    const payload: Record<string, unknown> = {
      key: draft.key.trim(),
      label: draft.label.trim(),
      type,
      required: Boolean(draft.required),
      isActive: Boolean(draft.isActive),
      placeholder: draft.placeholder.trim().length ? draft.placeholder.trim() : null,
      helpText: draft.helpText.trim().length ? draft.helpText.trim() : null,
      config,
    };

    const res = await api<unknown>(`/api/admin/v1/forms/${form.id}/fields/${selected.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!mountedRef.current) return;

    if (!res.ok) {
      const err = getErrMessage(res);
      const friendly = err.code === "KEY_CONFLICT" ? "Key already exists. Please choose a different key." : err.message;
      setSaveErr(friendly || "Could not save.");
      setSaveTraceId(err.traceId || null);
      endSaveError();
      return;
    }

    await refresh(selected.id);
    endSaveSuccess();
  }

  return {
    loading,
    loadErr,
    form,
    refresh,

    toast,
    dismissToast,
    runToastAction,

    statusBusy,
    setStatus,

    fieldsOrdered,
    selectedId,
    setSelectedId,

    showInactive,
    setShowInactive,

    draft,
    setDraftPatch,

    saveState,
    saveErr,
    saveTraceId,

    createField,
    duplicateField,
    deleteField,

    patchFieldFlags,
    reorderVisible,
  };
}
