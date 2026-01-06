"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiErr, ApiOk, ExportJob, ExportJobStatus, FormListItem } from "./exports.types";
import { formatDateTime, statusLabel } from "./exports.types";
import { ExportCreateModal, type ExportCreateValues } from "./ExportCreateModal";
import { Button } from "../_ui/Button";
import { Chip } from "../_ui/Chip";
import { EmptyState } from "../_ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeadCell, TableHeadRow, TableRow } from "../_ui/Table";

type UiError = { message: string; traceId?: string; code?: string };

async function apiJson<T>(
  url: string,
  opts: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
  } = {}
): Promise<{ data: T; traceId: string }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };

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

function IconArrowDown() {
  return (
    <svg viewBox="0 0 24 24" width="44" height="44" fill="none" aria-hidden="true">
      <path
        d="M12 3.5v10.8m0 0 3.6-3.6M12 14.3 8.4 10.7M5.5 19.5h13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function statusTone(status: ExportJobStatus): "neutral" | "subtle" | "muted" {
  if (status === "FAILED") return "muted";
  return "subtle";
}

function Notice(props: { err: UiError; onRetry: () => void; onDismiss: () => void }) {
  const { err, onRetry, onDismiss } = props;

  return (
    <div
      role="alert"
      style={{
        border: "1px solid var(--lr-border-subtle)",
        borderRadius: 12,
        padding: "var(--lr-space-s)",
        background: "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, color: "var(--lr-text)" }}>
            {err.code ? `${err.code}: ` : ""}{err.message}
          </div>
          {err.traceId ? (
            <div className="lr-meta" style={{ marginTop: 6 }}>
              Trace: <span className="lr-mono">{err.traceId}</span>
            </div>
          ) : null}
        </div>

        <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onDismiss}>Dismiss</Button>
          <Button variant="secondary" onClick={onRetry}>Retry</Button>
        </div>
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
    <div className="lr-page" style={{ maxWidth: 1100 }}>
      <div className="lr-pageHeader">
        <div className="lr-toolbar">
          <div>
            <h1 className="lr-h1">Exports</h1>
            <p className="lr-muted">Create CSV exports and download the file.</p>
          </div>

          <div className="lr-toolbarRight">
            <Button variant="ghost" onClick={() => void loadAll()} disabled={loading}>
              Refresh
            </Button>
            <Button variant="primary" onClick={() => setModalOpen(true)} disabled={loading}>
              Create export
            </Button>
          </div>
        </div>
        <div className="lr-divider" />
      </div>

      {err ? (
        <Notice err={err} onRetry={() => void loadAll()} onDismiss={() => setErr(null)} />
      ) : null}

      {loading ? (
        <div className="lr-muted">Loading…</div>
      ) : jobRows.length === 0 ? (
        <EmptyState
          icon={<IconArrowDown />}
          title="No exports yet."
          hint="Create an export to get started."
          cta={
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              Create export
            </Button>
          }
        />
      ) : (
        <Table ariaLabel="Export jobs">
          <TableHead>
            <TableHeadRow>
              <TableHeadCell>Job</TableHeadCell>
              <TableHeadCell>Status</TableHeadCell>
              <TableHeadCell>Queued</TableHeadCell>
              <TableHeadCell>Finished</TableHeadCell>
              <TableHeadCell align="right"></TableHeadCell>
            </TableHeadRow>
          </TableHead>

          <TableBody>
            {jobRows.map((j) => (
              <TableRow
                key={j.id}
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startPolling(j.id)}
                      disabled={j.status === "DONE" || j.status === "FAILED"}
                      title="Poll status now"
                    >
                      Poll
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
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
                    </Button>
                  </>
                }
              >
                <TableCell>
                  <div className="lr-mono" style={{ fontSize: "12px" }}>{j.id}</div>
                  <div className="lr-meta" style={{ marginTop: 6 }}>type: {j.type}</div>
                </TableCell>

                <TableCell>
                  <Chip tone={statusTone(j.status as ExportJobStatus)}>{statusLabel(j.status as ExportJobStatus)}</Chip>
                </TableCell>

                <TableCell>
                  <span className="lr-secondaryText">{formatDateTime(j.queuedAt)}</span>
                </TableCell>

                <TableCell>
                  <span className="lr-secondaryText">{formatDateTime(j.finishedAt)}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

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
