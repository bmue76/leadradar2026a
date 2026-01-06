"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiErr, ApiOk, ExportJob, ExportJobStatus, FormListItem } from "./exports.types";
import { formatDateTime, statusLabel } from "./exports.types";
import { ExportCreateModal, type ExportCreateValues } from "./ExportCreateModal";
import { adminFetchJson } from "../_lib/adminFetch";

type UiError = { message: string; traceId?: string; code?: string };

function StatusBadge({ status }: { status: ExportJobStatus }) {
  const cls =
    status === "DONE"
      ? "bg-emerald-100 text-emerald-800"
      : status === "FAILED"
        ? "bg-rose-100 text-rose-800"
        : status === "RUNNING"
          ? "bg-amber-100 text-amber-800"
          : "bg-neutral-100 text-neutral-700";

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${cls}`}>
      {statusLabel(status)}
    </span>
  );
}

function ErrorBanner({ err, onDismiss }: { err: UiError; onDismiss: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-rose-900">
            {err.code ? `${err.code}: ` : ""}
            {err.message}
          </div>
          {err.traceId ? (
            <div className="mt-1 text-xs text-rose-800">
              traceId: <span className="font-mono">{err.traceId}</span>
            </div>
          ) : null}
        </div>
        <button
          className="rounded-xl px-3 py-2 text-sm bg-white hover:bg-neutral-50 border border-rose-200"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

async function safeParseErr(res: Response): Promise<UiError | null> {
  const traceId = res.headers.get("x-trace-id") || undefined;

  try {
    const json = (await res.json()) as ApiOk<unknown> | ApiErr;
    if ((json as ApiErr)?.ok === false) {
      return {
        message: (json as ApiErr).error?.message || `Request failed (${res.status})`,
        traceId: (json as ApiErr).traceId || traceId,
        code: (json as ApiErr).error?.code,
      };
    }
  } catch {
    // ignore
  }

  return {
    message: `Request failed (${res.status})`,
    traceId,
  };
}

export default function ExportsClient() {
  const [forms, setForms] = useState<FormListItem[]>([]);
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCreate, setBusyCreate] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [err, setErr] = useState<UiError | null>(null);

  const pollRef = useRef<number | null>(null);
  const pollingJobId = useRef<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const [formsRes, jobsRes] = await Promise.all([
        adminFetchJson<{ items: FormListItem[] }>("/api/admin/v1/forms?limit=200", { method: "GET" }),
        adminFetchJson<{ items: ExportJob[] }>("/api/admin/v1/exports?type=CSV&limit=50", { method: "GET" }),
      ]);

      if (!formsRes.ok) throw { message: formsRes.message, traceId: formsRes.traceId, code: formsRes.code } satisfies UiError;
      if (!jobsRes.ok) throw { message: jobsRes.message, traceId: jobsRes.traceId, code: jobsRes.code } satisfies UiError;

      setForms(formsRes.data.items || []);
      setJobs(jobsRes.data.items || []);
    } catch (e) {
      setErr(e as UiError);
    } finally {
      setLoading(false);
    }
  }, []);

  const startPolling = useCallback((jobId: string) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollingJobId.current = jobId;

    pollRef.current = window.setInterval(async () => {
      const id = pollingJobId.current;
      if (!id) return;

      try {
        const res = await adminFetchJson<{ job: ExportJob }>(`/api/admin/v1/exports/${id}`, { method: "GET" });
        if (!res.ok) throw { message: res.message, traceId: res.traceId, code: res.code } satisfies UiError;

        const job = res.data.job;

        setJobs((prev) => {
          const next = [...prev];
          const idx = next.findIndex((j) => j.id === job.id);
          if (idx >= 0) next[idx] = job;
          else next.unshift(job);
          next.sort((a, b) => (b.queuedAt || b.updatedAt).localeCompare(a.queuedAt || a.updatedAt));
          return next;
        });

        if (job.status === "DONE" || job.status === "FAILED") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          pollingJobId.current = null;
        }
      } catch (e) {
        setErr(e as UiError);
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        pollingJobId.current = null;
      }
    }, 1200);
  }, []);

  useEffect(() => {
    void loadAll();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [loadAll]);

  const jobRows = useMemo(() => jobs, [jobs]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Exports</h1>
          <p className="text-sm text-zinc-600 mt-1">CSV exports with polling + download.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-xl px-4 py-2 text-sm border border-black/10 bg-white hover:bg-black/[0.02] focus:outline-none focus:ring-2 focus:ring-black/10"
            onClick={() => void loadAll()}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            className="rounded-xl px-4 py-2 text-sm bg-zinc-900 text-white hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-black/10 disabled:bg-black/40"
            onClick={() => setModalOpen(true)}
            disabled={loading}
          >
            Create CSV export
          </button>
        </div>
      </div>

      {err ? (
        <div>
          <ErrorBanner err={err} onDismiss={() => setErr(null)} />
        </div>
      ) : null}

      <div className="rounded-2xl border border-black/10 bg-white overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-900">Jobs</div>
          <div className="text-xs text-zinc-500">{loading ? "Loading…" : `${jobRows.length} job(s)`}</div>
        </div>

        {loading ? (
          <div className="px-4 pb-4 text-sm text-zinc-500">Loading exports…</div>
        ) : jobRows.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <div className="text-sm font-semibold text-zinc-900">No exports</div>
            <div className="mt-1 text-sm text-zinc-600">Create an export to download leads as CSV.</div>
            <div className="mt-3">
              <button
                className="rounded-xl px-4 py-2 text-sm bg-zinc-900 text-white hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-black/10"
                onClick={() => setModalOpen(true)}
              >
                Create CSV export
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-black/45">
                <tr>
                  <th className="px-4 py-2 font-medium">Job</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Queued</th>
                  <th className="px-4 py-2 font-medium">Finished</th>
                  <th className="px-4 py-2 font-medium text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {jobRows.map((j) => (
                  <tr key={j.id} className="group hover:bg-black/[0.02]">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-zinc-800">{j.id}</div>
                      <div className="text-xs text-zinc-500 mt-1">type: {j.type}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={j.status as ExportJobStatus} />
                    </td>
                    <td className="px-4 py-3">{formatDateTime(j.queuedAt)}</td>
                    <td className="px-4 py-3">{formatDateTime(j.finishedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          className="rounded-xl px-3 py-2 text-xs border border-black/10 bg-white hover:bg-black/[0.02] focus:outline-none focus:ring-2 focus:ring-black/10"
                          onClick={() => startPolling(j.id)}
                          disabled={j.status === "DONE" || j.status === "FAILED"}
                          title="Poll status now"
                        >
                          Poll
                        </button>

                        <button
                          className="rounded-xl px-3 py-2 text-xs bg-zinc-900 text-white hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-black/10 disabled:opacity-40"
                          disabled={j.status !== "DONE"}
                          onClick={async () => {
                            setErr(null);
                            try {
                              const res = await fetch(`/api/admin/v1/exports/${j.id}/download`, {
                                method: "GET",
                                credentials: "same-origin",
                                cache: "no-store",
                              });

                              if (!res.ok) {
                                const e = await safeParseErr(res);
                                throw e ?? ({ message: `Download failed (${res.status})` } satisfies UiError);
                              }

                              const contentDisposition = res.headers.get("content-disposition") || "";
                              const filenameMatch = /filename="([^"]+)"/.exec(contentDisposition);
                              const filename = filenameMatch?.[1] || "leadradar-export.csv";

                              const blob = await res.blob();
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = filename;
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                              window.URL.revokeObjectURL(url);
                            } catch (e) {
                              setErr(e as UiError);
                            }
                          }}
                        >
                          Download
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen ? (
        <ExportCreateModal
          forms={forms}
          busy={busyCreate}
          onClose={() => {
            if (!busyCreate) setModalOpen(false);
          }}
          onSubmit={async (values: ExportCreateValues) => {
            setBusyCreate(true);
            setErr(null);

            try {
              const res = await adminFetchJson<{ job: ExportJob }>("/api/admin/v1/exports/csv", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  formId: values.formId,
                  includeDeleted: values.includeDeleted,
                  from: values.from,
                  to: values.to,
                  limit: 10000,
                }),
              });

              if (!res.ok) throw { message: res.message, traceId: res.traceId, code: res.code } satisfies UiError;

              setModalOpen(false);

              const created = res.data.job;
              setJobs((prev) => [created, ...prev]);
              startPolling(created.id);
            } catch (e) {
              setErr(e as UiError);
            } finally {
              setBusyCreate(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
