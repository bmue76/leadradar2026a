"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { adminFetchJson } from "../../_lib/adminFetch";

import FormTabs from "./_components/FormTabs";
import OverviewPane from "./_components/OverviewPane";
import FormWorkspace from "./_components/FormWorkspace";

import { useFormDetail } from "./_lib/useFormDetail";
import type { ApiResponse, FormDetail, FormStatus } from "./formDetail.types";

type InlineError = { message: string; code?: string; traceId?: string } | null;
type TabKey = "overview" | "builder";

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

export default function FormDetailClient({
  formId,
  initialTab,
}: {
  formId: string;
  initialTab: TabKey;
}) {
  const mountedRef = useRef(true);

  const { loading, loadErr, form, setForm, refresh } = useFormDetail(formId);

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [toast, setToast] = useState<string | null>(null);

  const [statusBusy, setStatusBusy] = useState(false);
  const [headerErr, setHeaderErr] = useState<InlineError>(null);

  const statuses: FormStatus[] = useMemo(() => ["DRAFT", "ACTIVE", "ARCHIVED"], []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

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
    setHeaderErr(null);

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
      setHeaderErr({ message: err.message, code: err.code, traceId: err.traceId });
      return;
    }

    setForm(res.data);
    showToast("Status updated.");
  }

  const containerMax =
    tab === "builder" ? "max-w-[1400px]" : "max-w-6xl";

  return (
    <div className={clsx("mx-auto w-full space-y-6 p-6", containerMax)}>
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
              onClick={() => void refresh()}
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

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <div className="text-sm text-gray-500">Status</div>
                  <select
                    value={form.status}
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

                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
                  disabled={statusBusy}
                >
                  Refresh
                </button>
              </div>
            </div>

            {headerErr ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <div className="font-medium">{headerErr.message}</div>
                <div className="mt-1 text-xs text-red-700/80">
                  {headerErr.code ? `Code: ${headerErr.code} · ` : null}
                  {headerErr.traceId ? `traceId: ${headerErr.traceId}` : null}
                </div>
              </div>
            ) : null}

            <div className="mt-5">
              <FormTabs formId={formId} activeTab={tab} />
            </div>
          </div>

          {tab === "overview" ? (
            <OverviewPane
              formId={formId}
              form={form}
              setForm={setForm}
              showToast={showToast}
            />
          ) : (
            <FormWorkspace
              formId={formId}
              form={form}
              setForm={setForm}
              refresh={refresh}
              showToast={showToast}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
