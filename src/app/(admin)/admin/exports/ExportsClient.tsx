"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiErr, ApiOk, ExportJob, ExportJobStatus, FormListItem } from "./exports.types";
import { formatDateTime, statusLabel } from "./exports.types";
import { ExportCreateModal, type ExportCreateValues } from "./ExportCreateModal";

type UiError = { message: string; traceId?: string; code?: string };

async function apiJson<T>(
  url: string,
  opts: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
  } = {}
): Promise<{ data: T; traceId: string }> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    credentials: "same-origin",
    cache: "no-store",
  });

  const traceId = res.headers.get("x-trace-id") || "";

  let json: ApiOk<T> | ApiErr | null = null;
  try {
    json = (await res.json()) as ApiOk<T> | ApiErr;
  } catch {
    // ignore
  }

  if (!res.ok || !json || (json as ApiErr).ok === false) {
    const err = json as ApiErr | null;
    throw {
      message: err?.error?.message || `Request failed (${res.status})`,
      traceId: err?.traceId || traceId || undefined,
      code: err?.error?.code,
    } satisfies UiError;
  }

  return { data: (json as ApiOk<T>).data, traceId: (json as ApiOk<T>).traceId };
}

async function apiDownloadCsv(url: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  const contentDisposition = res.headers.get("content-disposition") || "";
  const filenameMatch = /filename="([^"]+)"/.exec(contentDisposition);
  const filename = filenameMatch?.[1] || "leadradar-export.csv";

  if (!res.ok) {
    let errJson: ApiErr | null = null;
    try {
      errJson = (await res.json()) as ApiErr;
    } catch {
      // ignore
    }
    throw {
      message: errJson?.error?.message || `Download failed (${res.status})`,
      traceId: errJson?.traceId || res.headers.get("x-trace-id") || undefined,
      code: errJson?.error?.code,
    } satisfies UiError;
  }

  const blob = await res.blob();
  return { blob, filename };
}

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
        apiJson<{ forms: FormListItem[] }>("/api/admin/v1/forms"),
        apiJson<{ items: ExportJob[] }>("/api/admin/v1/exports?type=CSV&limit=50"),
      ]);

      setForms(formsRes.data.forms || []);
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
        const res = await apiJson<{ job: ExportJob }>(`/api/admin/v1/exports/${id}`);
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
    <div className="p-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Exports</h1>
          <p className="text-sm text-neutral-500 mt-1">
            CSV exports (jobs) with polling + download. Phase 1 uses dev storage stub{" "}
            <span className="font-mono">.tmp_exports/</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-xl px-4 py-2 text-sm bg-neutral-100 hover:bg-neutral-200"
            onClick={() => void loadAll()}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            className="rounded-xl px-4 py-2 text-sm bg-black text-white hover:bg-black/90 disabled:bg-black/40"
            onClick={() => setModalOpen(true)}
            disabled={loading}
          >
            Create CSV Export
          </button>
        </div>
      </div>

      {err ? (
        <div className="mt-4">
          <ErrorBanner err={err} onDismiss={() => setErr(null)} />
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-neutral-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
          <div className="text-sm font-semibold">Jobs</div>
          <div className="text-xs text-neutral-500">{loading ? "Loading..." : `${jobRows.length} job(s)`}</div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-neutral-500">Loading exports…</div>
        ) : jobRows.length === 0 ? (
          <div className="p-6 text-sm text-neutral-500">No exports yet. Create one to get started.</div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">Job</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Queued</th>
                  <th className="px-4 py-3 font-medium">Finished</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobRows.map((j) => (
                  <tr key={j.id} className="border-t border-neutral-100">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs">{j.id}</div>
                      <div className="text-xs text-neutral-500 mt-1">type: {j.type}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={j.status as ExportJobStatus} />
                    </td>
                    <td className="px-4 py-3">{formatDateTime(j.queuedAt)}</td>
                    <td className="px-4 py-3">{formatDateTime(j.finishedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          className="rounded-xl px-3 py-2 text-sm bg-neutral-100 hover:bg-neutral-200"
                          onClick={() => startPolling(j.id)}
                          disabled={j.status === "DONE" || j.status === "FAILED"}
                          title="Poll status now"
                        >
                          Poll
                        </button>
                        <button
                          className="rounded-xl px-3 py-2 text-sm bg-black text-white hover:bg-black/90 disabled:bg-black/40"
                          disabled={j.status !== "DONE"}
                          onClick={async () => {
                            setErr(null);
                            try {
                              const { blob, filename } = await apiDownloadCsv(`/api/admin/v1/exports/${j.id}/download`);
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
              const res = await apiJson<{ job: ExportJob }>("/api/admin/v1/exports/csv", {
                method: "POST",
                body: {
                  formId: values.formId,
                  includeDeleted: values.includeDeleted,
                  from: values.from,
                  to: values.to,
                  limit: 10000,
                },
              });

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
