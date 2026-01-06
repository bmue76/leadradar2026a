"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminFetchJson } from "../_lib/adminFetch";
import type { FormListItem, FormStatus } from "./forms.types";
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

    const res = await adminFetchJson<unknown>(`/api/admin/v1/forms${buildQuery(qDebounced, status)}`, {
      method: "GET",
    });

    if (seq !== reqSeq.current) return;

    if (!res.ok) {
      setItems([]);
      setErrorMsg(res.message || "Could not load forms.");
      setErrorTraceId(res.traceId || null);
      setLoading(false);
      return;
    }

    const normalized = normalizeFormsListPayload(res.data);
    setItems(normalized);
    setLoading(false);
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
    window.setTimeout(() => setFlash(null), 2500);
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
      <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
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
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
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
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
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
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400"
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
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            Create form
          </button>
        </div>
      </div>

      {flash ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          {flash}
        </div>
      ) : null}

      {/* States */}
      {loading ? (
        <div className="rounded-xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-900">Forms</div>
          <div className="divide-y divide-zinc-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="space-y-2">
                  <div className="h-4 w-56 rounded bg-zinc-100" />
                  <div className="h-3 w-72 rounded bg-zinc-100" />
                </div>
                <div className="h-8 w-20 rounded bg-zinc-100" />
              </div>
            ))}
          </div>
        </div>
      ) : errorMsg ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
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
              className="rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-900 shadow-sm hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200"
            >
              Retry
            </button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center">
          <div className="text-base font-semibold text-zinc-900">No forms yet</div>
          <p className="mt-1 text-sm text-zinc-600">
            Create your first form to start capturing leads on your next event.
          </p>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              Create your first form
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-900">Forms</div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-100">
                {items.map((f) => (
                  <tr
                    key={f.id}
                    className="cursor-pointer hover:bg-zinc-50"
                    onClick={() => openRow(f.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") openRow(f.id);
                    }}
                    tabIndex={0}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900">{f.name}</div>
                      {f.description ? (
                        <div className="mt-0.5 line-clamp-1 text-xs text-zinc-600">
                          {f.description}
                        </div>
                      ) : (
                        <div className="mt-0.5 text-xs text-zinc-400">No description</div>
                      )}
                      {typeof f.fieldsCount === "number" ? (
                        <div className="mt-1 text-xs text-zinc-500">{f.fieldsCount} field(s)</div>
                      ) : null}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${badgeClass(
                          f.status
                        )}`}
                      >
                        {formatFormStatus(f.status)}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-xs text-zinc-600">
                      {formatUpdatedAt(f.updatedAt)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/forms/${f.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400"
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
