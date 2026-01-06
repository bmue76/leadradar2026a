"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminFetchJson } from "../_lib/adminFetch";
import type { ApiResponse, FormListItem, FormStatus } from "./forms.types";
import { formatFormStatus, formatUpdatedAt, normalizeFormsListPayload } from "./forms.types";
import { CreateFormModal } from "./CreateFormModal";

type StatusFilter = "ALL" | FormStatus;

function badgeClass(status: FormStatus): string {
  if (status === "ACTIVE") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "ARCHIVED") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-zinc-200 bg-zinc-50 text-zinc-900";
}

function buildQuery(q: string, status: StatusFilter): string {
  const p = new URLSearchParams();
  if (q.trim().length) p.set("q", q.trim());
  if (status !== "ALL") p.set("status", status);
  const s = p.toString();
  return s ? `?${s}` : "";
}

function EmptyIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 7.5h8M8 11h8M8 14.5h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.65"
      />
      <path
        d="M7.5 3.5h7.2l2.8 2.8V19a1.5 1.5 0 0 1-1.5 1.5h-8.5A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1.5-1.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.55"
      />
      <path
        d="M14.7 3.6V6a1 1 0 0 0 1 1h2.4"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.55"
      />
    </svg>
  );
}

export function FormsListClient() {
  const router = useRouter();

  const [q, setQ] = React.useState("");
  const [qDebounced, setQDebounced] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("ALL");

  const [items, setItems] = React.useState<FormListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [errorTraceId, setErrorTraceId] = React.useState<string | null>(null);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [flash, setFlash] = React.useState<string | null>(null);

  const reqSeq = React.useRef(0);

  React.useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q), 320);
    return () => window.clearTimeout(t);
  }, [q]);

  const fetchForms = React.useCallback(async () => {
    const seq = ++reqSeq.current;

    setLoading(true);
    setErrorMsg(null);
    setErrorTraceId(null);

    try {
      const res = (await adminFetchJson(
        `/api/admin/v1/forms${buildQuery(qDebounced, status)}`,
        { method: "GET" }
      )) as ApiResponse<unknown>;

      if (seq !== reqSeq.current) return;

      if (!res.ok) {
        setItems([]);
        setErrorMsg(res.error.message || "Could not load forms.");
        setErrorTraceId(res.traceId || null);
        setLoading(false);
        return;
      }

      const normalized = normalizeFormsListPayload(res.data);
      setItems(normalized);
      setLoading(false);
    } catch {
      if (seq !== reqSeq.current) return;
      setItems([]);
      setErrorMsg("Network error. Please try again.");
      setErrorTraceId(null);
      setLoading(false);
    }
  }, [qDebounced, status]);

  React.useEffect(() => {
    void fetchForms();
  }, [fetchForms]);

  const retry = React.useCallback(() => {
    void fetchForms();
  }, [fetchForms]);

  const onCreated = React.useCallback(() => {
    setFlash("Form created.");
    void fetchForms();
    window.setTimeout(() => setFlash(null), 2200);
  }, [fetchForms]);

  const clearFilters = React.useCallback(() => {
    setQ("");
    setQDebounced("");
    setStatus("ALL");
  }, []);

  const openRow = React.useCallback(
    (id: string) => {
      router.push(`/admin/forms/${id}`);
    },
    [router]
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 rounded-2xl border border-black/10 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex-1">
            <label htmlFor="forms-search" className="sr-only">
              Search forms
            </label>
            <input
              id="forms-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search forms…"
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>

          <div className="sm:w-52">
            <label htmlFor="forms-status" className="sr-only">
              Status filter
            </label>
            <select
              id="forms-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-black/10"
            >
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>

          {(q.trim().length > 0 || status !== "ALL") && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-black/[0.02] focus:outline-none focus:ring-2 focus:ring-black/10"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <div className="text-xs text-zinc-500">
            {loading ? "Loading…" : `${items.length} form${items.length === 1 ? "" : "s"}`}
          </div>

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-black/10"
          >
            Create form
          </button>
        </div>
      </div>

      {flash ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          {flash}
        </div>
      ) : null}

      {/* States */}
      {loading ? (
        <div className="rounded-2xl border border-black/10 bg-white">
          <div className="px-4 py-3 text-sm font-medium text-zinc-900">Forms</div>
          <div className="px-4 pb-3">
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <div className="space-y-2">
                    <div className="h-4 w-56 rounded bg-zinc-100" />
                    <div className="h-3 w-72 rounded bg-zinc-100" />
                  </div>
                  <div className="h-8 w-20 rounded bg-zinc-100" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : errorMsg ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div className="text-sm font-semibold text-rose-900">Couldn’t load forms</div>
          <div className="mt-1 text-sm text-rose-800">{errorMsg}</div>
          {errorTraceId ? (
            <div className="mt-2 text-xs text-rose-800">
              Trace ID: <span className="font-mono">{errorTraceId}</span>
            </div>
          ) : null}
          <div className="mt-3">
            <button
              type="button"
              onClick={retry}
              className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-900 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200"
            >
              Retry
            </button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="mx-auto flex max-w-md flex-col items-center text-center gap-2">
            <div className="text-zinc-500">
              <EmptyIcon />
            </div>
            <div className="text-base font-semibold text-zinc-900">No forms</div>
            <p className="text-sm text-zinc-600">Create a form to start collecting leads.</p>
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-black/10"
              >
                Create form
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
          <div className="px-4 py-3 text-sm font-medium text-zinc-900">Forms</div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Updated</th>
                  <th className="px-4 py-2 font-medium text-right"> </th>
                </tr>
              </thead>

              <tbody>
                {items.map((f) => (
                  <tr
                    key={f.id}
                    className="group cursor-pointer hover:bg-black/[0.02]"
                    onClick={() => openRow(f.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openRow(f.id);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-zinc-900">{f.name}</div>
                      {f.description ? (
                        <div className="mt-0.5 line-clamp-1 text-xs text-zinc-600">{f.description}</div>
                      ) : (
                        <div className="mt-0.5 text-xs text-zinc-400">No description</div>
                      )}
                      {typeof f.fieldsCount === "number" ? (
                        <div className="mt-1 text-xs text-zinc-500">{f.fieldsCount} field(s)</div>
                      ) : null}
                    </td>

                    <td className="px-4 py-3 align-top">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${badgeClass(
                          f.status
                        )}`}
                      >
                        {formatFormStatus(f.status)}
                      </span>
                    </td>

                    <td className="px-4 py-3 align-top text-xs text-zinc-600">
                      {formatUpdatedAt(f.updatedAt)}
                    </td>

                    <td className="px-4 py-3 align-top text-right">
                      <Link
                        href={`/admin/forms/${f.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-black/[0.02] focus:outline-none focus:ring-2 focus:ring-black/10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                        aria-label="Open form"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CreateFormModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={onCreated} />
    </div>
  );
}
