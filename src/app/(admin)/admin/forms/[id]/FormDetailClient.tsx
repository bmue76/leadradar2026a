"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetchJson } from "../../_lib/adminFetch";
import FieldModal from "./FieldModal";
import FieldsTable from "./FieldsTable";
import type { ApiResponse, FieldUpsertInput, FormDetail, FormField, FormStatus } from "./formDetail.types";

type InlineError = { message: string; code?: string; traceId?: string } | null;

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

type UnknownRecord = Record<string, unknown>;
function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getErrMessage(res: unknown): { message: string; code?: string; traceId?: string } {
  // Expected: { ok:false, error:{code,message}, traceId }
  if (isRecord(res)) {
    const traceId = typeof res.traceId === "string" ? res.traceId : undefined;

    if (res.ok === false && isRecord(res.error)) {
      const msg = typeof res.error.message === "string" ? res.error.message : "Request failed.";
      const code = typeof res.error.code === "string" ? res.error.code : undefined;
      return { message: msg, code, traceId };
    }

    // fallback: maybe error nested differently
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

function sortFieldsStable(fields: FormField[]) {
  return [...fields].sort((a, b) => {
    const ao = typeof a.sortOrder === "number" ? a.sortOrder : 0;
    const bo = typeof b.sortOrder === "number" ? b.sortOrder : 0;
    if (ao !== bo) return ao - bo;
    return (a.label || "").localeCompare(b.label || "");
  });
}

export default function FormDetailClient({ formId }: { formId: string }) {
  const mountedRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<InlineError>(null);
  const [form, setForm] = useState<FormDetail | null>(null);

  const [actionErr, setActionErr] = useState<InlineError>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [statusBusy, setStatusBusy] = useState(false);

  const [order, setOrder] = useState<string[]>([]);
  const [orderDirty, setOrderDirty] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);

  const [fieldModalOpen, setFieldModalOpen] = useState(false);
  const [fieldModalMode, setFieldModalMode] = useState<"create" | "edit">("create");
  const [fieldModalInitial, setFieldModalInitial] = useState<FormField | null>(null);
  const [fieldModalBusy, setFieldModalBusy] = useState(false);
  const [fieldModalApiError, setFieldModalApiError] = useState<InlineError>(null);
  const [fieldModalKey, setFieldModalKey] = useState(0);

  const statuses: FormStatus[] = useMemo(() => ["DRAFT", "ACTIVE", "ARCHIVED"], []);

  const fieldsSorted = useMemo(() => {
    const fs = form?.fields || [];
    return sortFieldsStable(fs);
  }, [form?.fields]);

  const fieldsById = useMemo(() => new Map((form?.fields || []).map((f) => [f.id, f])), [form?.fields]);

  const orderedFields = useMemo(() => {
    if (!form) return [];
    const existing = new Set((form.fields || []).map((f) => f.id));
    const normalized = [
      ...order.filter((id) => existing.has(id)),
      ...fieldsSorted.map((f) => f.id).filter((id) => !order.includes(id)),
    ];
    return normalized.map((id) => fieldsById.get(id)).filter(Boolean) as FormField[];
  }, [form, order, fieldsById, fieldsSorted]);

  const fetchForm = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    setActionErr(null);
    setToast(null);

    const res = await api<FormDetail>(`/api/admin/v1/forms/${formId}`);

    if (!mountedRef.current) return;

    if (!res.ok) {
      setForm(null);
      setOrder([]);
      setOrderDirty(false);

      const err = getErrMessage(res);
      setLoadErr({ message: err.message, code: err.code, traceId: err.traceId });

      setLoading(false);
      return;
    }

    setForm(res.data);

    const initialOrder = sortFieldsStable(res.data.fields || []).map((f) => f.id);
    setOrder(initialOrder);
    setOrderDirty(false);

    setLoading(false);
  }, [formId]);

  useEffect(() => {
    mountedRef.current = true;

    // Avoid react-hooks/set-state-in-effect lint by scheduling the fetch.
    const t = window.setTimeout(() => {
      void fetchForm();
    }, 0);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(t);
    };
  }, [fetchForm]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => {
      if (mountedRef.current) setToast(null);
    }, 2200);
  }

  async function setStatus(next: FormStatus) {
    if (!form) return;
    const prev = form.status;

    setForm({ ...form, status: next });
    setStatusBusy(true);
    setActionErr(null);

    const res = await api<FormDetail>(`/api/admin/v1/forms/${formId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });

    if (!mountedRef.current) return;

    setStatusBusy(false);

    if (!res.ok) {
      const err = getErrMessage(res);
      setForm({ ...form, status: prev });
      setActionErr({ message: err.message, code: err.code, traceId: err.traceId });
      return;
    }

    setForm(res.data);
    showToast("Status updated.");
  }

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

    const nextOrder = sortFieldsStable(res.data.fields || []).map((f) => f.id);
    setOrder(nextOrder);
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
    const nextOrder = sortFieldsStable(res.data.fields || []).map((f) => f.id);
    setOrder(nextOrder);
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
    setToast(null);
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
    if (!form) return;
    setOrderBusy(true);
    setActionErr(null);

    const existing = new Set((form.fields || []).map((f) => f.id));
    const normalized = [
      ...order.filter((id) => existing.has(id)),
      ...fieldsSorted.map((f) => f.id).filter((id) => !order.includes(id)),
    ];

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
    const nextOrder = sortFieldsStable(res.data.fields || []).map((f) => f.id);
    setOrder(nextOrder);
    setOrderDirty(false);

    showToast("Order saved.");
  }

  const headerStatus = form?.status || "—";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Link href="/admin/forms" className="text-sm text-gray-600 hover:text-gray-900">
          ← Forms
        </Link>
        {toast ? (
          <div className="rounded-full border bg-white px-3 py-1 text-sm text-gray-700 shadow-sm">
            {toast}
          </div>
        ) : (
          <div />
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-9 w-2/3 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-5 w-1/3 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      ) : null}

      {!loading && loadErr ? (
        <div className="rounded-2xl border bg-white p-6">
          <div className="text-lg font-semibold">Could not load form</div>
          <div className="mt-2 text-sm text-gray-600">{loadErr.message}</div>
          <div className="mt-2 text-xs text-gray-500">
            {loadErr.code ? `Code: ${loadErr.code} · ` : null}
            {loadErr.traceId ? `traceId: ${loadErr.traceId}` : null}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void fetchForm()}
              className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-black/90"
            >
              Retry
            </button>
            <Link
              href="/admin/forms"
              className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
            >
              Back to Forms
            </Link>
          </div>
        </div>
      ) : null}

      {!loading && !loadErr && form ? (
        <>
          <div className="rounded-2xl border bg-white p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-2xl font-semibold text-gray-900">{form.name}</div>
                {form.description ? (
                  <div className="mt-1 text-sm text-gray-600">{form.description}</div>
                ) : (
                  <div className="mt-1 text-sm text-gray-400">No description.</div>
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                  <div>Created: {formatDateTime(form.createdAt)}</div>
                  <div>Updated: {formatDateTime(form.updatedAt)}</div>
                  <div className="font-mono">ID: {form.id}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-sm text-gray-500">Status</div>
                <select
                  value={headerStatus}
                  onChange={(e) => void setStatus(e.target.value as FormStatus)}
                  disabled={statusBusy}
                  className="rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 disabled:opacity-50"
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
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
          </div>

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
                      "rounded-lg px-4 py-2 text-sm text-white",
                      orderBusy ? "bg-black/60" : "bg-black hover:bg-black/90"
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
                    className="mt-4 rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-black/90"
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
        </>
      ) : null}
    </div>
  );
}
