"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FieldModal from "../FieldModal";
import FieldsTable from "../FieldsTable";
import { adminFetchJson } from "../../../_lib/adminFetch";

import { normalizeOrder, sortFieldsStable } from "../_lib/sort";
import type { ApiResponse, FieldUpsertInput, FormDetail, FormField } from "../formDetail.types";

type InlineError = { message: string; code?: string; traceId?: string } | null;

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

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
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: msg },
      traceId: "no-trace-id",
    };
  }
}

export default function OverviewPane({
  formId,
  form,
  setForm,
  showToast,
}: {
  formId: string;
  form: FormDetail;
  setForm: (f: FormDetail) => void;
  showToast: (msg: string) => void;
}) {
  const mountedRef = useRef(true);

  const [actionErr, setActionErr] = useState<InlineError>(null);

  const [order, setOrder] = useState<string[]>([]);
  const [orderDirty, setOrderDirty] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);

  const [fieldModalOpen, setFieldModalOpen] = useState(false);
  const [fieldModalMode, setFieldModalMode] = useState<"create" | "edit">("create");
  const [fieldModalInitial, setFieldModalInitial] = useState<FormField | null>(null);
  const [fieldModalBusy, setFieldModalBusy] = useState(false);
  const [fieldModalApiError, setFieldModalApiError] = useState<InlineError>(null);
  const [fieldModalKey, setFieldModalKey] = useState(0);

  const fieldsSorted = useMemo(() => sortFieldsStable(form.fields || []), [form.fields]);

  const fieldsById = useMemo(() => new Map((form.fields || []).map((f) => [f.id, f])), [form.fields]);

  const orderedFields = useMemo(() => {
    const normalized = normalizeOrder(order, fieldsSorted);
    return normalized.map((id) => fieldsById.get(id)).filter(Boolean) as FormField[];
  }, [order, fieldsSorted, fieldsById]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // initialize/sync order when not dirty
    if (!orderDirty) {
      const initialOrder = sortFieldsStable(form.fields || []).map((f) => f.id);
      setOrder(initialOrder);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id, form.fields]);

  function openCreateField() {
    setFieldModalMode("create");
    setFieldModalInitial(null);
    setFieldModalApiError(null);
    setFieldModalKey((k) => k + 1);
    setFieldModalOpen(true);
  }

  function openEditField(field: FormField) {
    setFieldModalMode("edit");
    setFieldModalInitial(field);
    setFieldModalApiError(null);
    setFieldModalKey((k) => k + 1);
    setFieldModalOpen(true);
  }

  async function submitField(input: FieldUpsertInput) {
    setFieldModalBusy(true);
    setFieldModalApiError(null);

    const isEdit = fieldModalMode === "edit" && fieldModalInitial?.id;
    const path = isEdit
      ? `/api/admin/v1/forms/${formId}/fields/${fieldModalInitial!.id}`
      : `/api/admin/v1/forms/${formId}/fields`;

    const method = isEdit ? "PATCH" : "POST";

    const res = await api<FormDetail>(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!mountedRef.current) return;

    setFieldModalBusy(false);

    if (!res.ok) {
      const err = getErrMessage(res);
      const friendly =
        err.code === "KEY_CONFLICT"
          ? "Key already exists. Please choose a different key."
          : err.message;

      setFieldModalApiError({ message: friendly, code: err.code, traceId: err.traceId });
      return;
    }

    setFieldModalOpen(false);
    setFieldModalInitial(null);
    setFieldModalApiError(null);

    setForm(res.data);
    setOrder(sortFieldsStable(res.data.fields || []).map((f) => f.id));
    setOrderDirty(false);

    showToast(isEdit ? "Field updated." : "Field created.");
  }

  async function deleteField(field: FormField) {
    const ok = window.confirm(`Delete field "${field.label}"?\n\nThis cannot be undone.`);
    if (!ok) return;

    setActionErr(null);

    const res = await api<FormDetail>(`/api/admin/v1/forms/${formId}/fields/${field.id}`, {
      method: "DELETE",
    });

    if (!mountedRef.current) return;

    if (!res.ok) {
      const err = getErrMessage(res);
      setActionErr({ message: err.message, code: err.code, traceId: err.traceId });
      return;
    }

    setForm(res.data);
    setOrder(sortFieldsStable(res.data.fields || []).map((f) => f.id));
    setOrderDirty(false);

    showToast("Field deleted.");
  }

  function swapInOrder(idA: string, idB: string) {
    setOrder((prev) => {
      const next = [...prev];
      const ia = next.indexOf(idA);
      const ib = next.indexOf(idB);
      if (ia < 0 || ib < 0) return prev;
      next[ia] = idB;
      next[ib] = idA;
      return next;
    });
    setOrderDirty(true);
  }

  function moveUp(fieldId: string) {
    const idx = order.indexOf(fieldId);
    if (idx <= 0) return;
    swapInOrder(order[idx - 1], order[idx]);
  }

  function moveDown(fieldId: string) {
    const idx = order.indexOf(fieldId);
    if (idx < 0 || idx >= order.length - 1) return;
    swapInOrder(order[idx], order[idx + 1]);
  }

  async function saveOrder() {
    setOrderBusy(true);
    setActionErr(null);

    const normalized = normalizeOrder(order, form.fields || []);

    const res = await api<FormDetail>(`/api/admin/v1/forms/${formId}/fields/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order: normalized }),
    });

    if (!mountedRef.current) return;

    setOrderBusy(false);

    if (!res.ok) {
      const err = getErrMessage(res);
      setActionErr({ message: err.message, code: err.code, traceId: err.traceId });
      return;
    }

    setForm(res.data);
    setOrder(sortFieldsStable(res.data.fields || []).map((f) => f.id));
    setOrderDirty(false);

    showToast("Order saved.");
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-semibold">Fields</div>
          <div className="mt-1 text-sm text-gray-500">
            Manage fields, activation, and order (no drag&drop in MVP).
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {orderDirty ? (
            <button
              type="button"
              onClick={() => void saveOrder()}
              disabled={orderBusy}
              className={clsx(
                "rounded-lg border px-4 py-2 text-sm",
                orderBusy ? "bg-gray-50 text-gray-500" : "hover:bg-gray-50"
              )}
            >
              {orderBusy ? "Saving…" : "Save order"}
            </button>
          ) : (
            <div className="text-sm text-gray-400">Order is saved</div>
          )}

          <button
            type="button"
            onClick={openCreateField}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Add field
          </button>
        </div>
      </div>

      {actionErr ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="font-medium">{actionErr.message}</div>
          <div className="mt-1 text-xs text-red-700/80">
            {actionErr.code ? `Code: ${actionErr.code} · ` : null}
            {actionErr.traceId ? `traceId: ${actionErr.traceId}` : null}
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        {orderedFields.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <div className="text-base font-medium">Add your first field</div>
            <div className="mt-1 text-sm text-gray-500">
              Start by adding a text field or a select field.
            </div>
            <button
              type="button"
              onClick={openCreateField}
              className="mt-4 rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
            >
              Add field
            </button>
          </div>
        ) : (
          <FieldsTable
            fields={form.fields}
            order={orderedFields.map((f) => f.id)}
            onMoveUp={moveUp}
            onMoveDown={moveDown}
            onEdit={openEditField}
            onDelete={deleteField}
            reorderDisabled={orderBusy}
          />
        )}
      </div>

      {fieldModalOpen ? (
        <FieldModal
          key={fieldModalKey}
          mode={fieldModalMode}
          initial={fieldModalInitial}
          onClose={() => {
            if (fieldModalBusy) return;
            setFieldModalOpen(false);
            setFieldModalInitial(null);
            setFieldModalApiError(null);
          }}
          onSubmit={submitField}
          busy={fieldModalBusy}
          apiError={fieldModalApiError}
        />
      ) : null}
    </div>
  );
}
