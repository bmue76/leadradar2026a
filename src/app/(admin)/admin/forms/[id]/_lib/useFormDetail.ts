"use client";

import * as React from "react";
import { adminFetchJson } from "../../../_lib/adminFetch";
import { parseCheckboxDefault, parseOptions } from "./fieldConfig";
import type { ApiResponse, FormDetail, FormField, FormStatus } from "../formDetail.types";
import type { FieldDraft } from "../_components/FormWorkspace";

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
    return String(a.label || "").localeCompare(String(b.label || ""));
  });
}

function deriveDraftFromField(f: FormField): FieldDraft {
  const type = String(f.type || "").toUpperCase();
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

function uniq(xs: string[]) {
  return Array.from(new Set(xs));
}

export function useFormDetail(formId: string) {
  const mountedRef = React.useRef(true);

  const [loading, setLoading] = React.useState(true);
  const [loadErr, setLoadErr] = React.useState<InlineError>(null);
  const [form, setForm] = React.useState<FormDetail | null>(null);

  const [toast, setToast] = React.useState<string | null>(null);

  const [statusBusy, setStatusBusy] = React.useState(false);

  const [order, setOrder] = React.useState<string[]>([]);
  const [orderDirty, setOrderDirty] = React.useState(false);
  const [orderBusy, setOrderBusy] = React.useState(false);

  const [selectedId, setSelectedId] = React.useState<string>("");
  const [draft, setDraft] = React.useState<FieldDraft | null>(null);

  const [saving, setSaving] = React.useState(false);
  const [saveErr, setSaveErr] = React.useState<string | null>(null);
  const [saveTraceId, setSaveTraceId] = React.useState<string | null>(null);

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

      setForm(res.data);

      const nextOrder = sortFieldsStable(res.data.fields || []).map((f) => f.id);
      setOrder(nextOrder);
      setOrderDirty(false);

      const desired = preferSelectedId && res.data.fields.some((f) => f.id === preferSelectedId)
        ? preferSelectedId
        : selectedId && res.data.fields.some((f) => f.id === selectedId)
          ? selectedId
          : res.data.fields[0]?.id || "";

      setSelectedId(desired);

      setLoading(false);
      return res.data;
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
  }, [selected?.id]);

  function setDraftPatch(patch: Partial<FieldDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function setStatus(next: FormStatus) {
    if (!form) return;

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
      setToast(`Status error: ${err.message}`);
      window.setTimeout(() => mountedRef.current && setToast(null), 2400);
      return;
    }

    await refresh();
  }

  async function createField() {
    if (!form) return;

    setSaveErr(null);
    setSaveTraceId(null);

    const key = `field_${Date.now()}`;
    const payload = {
      key,
      label: "New field",
      type: "TEXT",
      required: false,
      isActive: true,
    };

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
      return;
    }

    const next = await refresh();
    const created = next?.fields?.find((f) => f.key === key);
    if (created?.id) setSelectedId(created.id);
  }

  /** Drag&Drop reorder (client only). Persist happens via saveOrder(). */
  function reorder(nextOrderIds: string[]) {
    const next = uniq(nextOrderIds);

    if (!form) {
      setOrder(next);
      setOrderDirty(true);
      return;
    }

    const existing = new Set((form.fields || []).map((f) => f.id));
    const normalized = [
      ...next.filter((id) => existing.has(id)),
      ...fieldsSorted.map((f) => f.id).filter((id) => !next.includes(id)),
    ];

    setOrder(normalized);
    setOrderDirty(true);
    setToast(null);
  }

  async function saveOrder(onDone?: () => void) {
    if (!form) return;

    setOrderBusy(true);

    const existing = new Set((form.fields || []).map((f) => f.id));
    const normalized = [
      ...order.filter((id) => existing.has(id)),
      ...fieldsSorted.map((f) => f.id).filter((id) => !order.includes(id)),
    ];

    const res = await api<unknown>(`/api/admin/v1/forms/${formId}/fields/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order: normalized }),
    });

    if (!mountedRef.current) return;

    setOrderBusy(false);

    if (!res.ok) {
      const err = getErrMessage(res);
      setToast(`Order error: ${err.message}`);
      window.setTimeout(() => mountedRef.current && setToast(null), 2400);
      return;
    }

    await refresh();
    onDone?.();
  }

  async function saveSelectedField(onDone?: () => void) {
    if (!form || !selected || !draft) return;

    setSaving(true);
    setSaveErr(null);
    setSaveTraceId(null);

    const type = draft.type.toUpperCase();

    let config: unknown = undefined;
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
      config: config ?? null,
    };

    const res = await api<unknown>(`/api/admin/v1/forms/${form.id}/fields/${selected.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!mountedRef.current) return;

    setSaving(false);

    if (!res.ok) {
      const err = getErrMessage(res);
      const friendly =
        err.code === "KEY_CONFLICT"
          ? "Key already exists. Please choose a different key."
          : err.message;

      setSaveErr(friendly || "Could not save.");
      setSaveTraceId(err.traceId || null);
      return;
    }

    await refresh(selected.id);
    onDone?.();
  }

  return {
    loading,
    loadErr,
    form,
    refresh,

    toast,
    setToast,

    statusBusy,
    setStatus,

    fieldsOrdered,
    selectedId,
    setSelectedId,

    orderDirty,
    orderBusy,
    reorder,
    saveOrder,

    saving,
    saveErr,
    saveTraceId,
    createField,
    draft,
    setDraftPatch,
    saveSelectedField,
  };
}
