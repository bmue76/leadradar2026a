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

type EventListItem = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  startsAt?: string | null;
  endsAt?: string | null;
  location?: string | null;
};

type ExportParamsLike = {
  scope?: string;
  includeDeleted?: boolean;
  eventId?: string | null;
  formId?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number | null;
  delimiter?: string;
  columnsVersion?: number;
  rowCount?: number;
};

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

function IconRefreshSmall() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M20 12a8 8 0 0 1-14.7 4.2M4 12a8 8 0 0 1 14.7-4.2M19 5v4h-4M5 19v-4h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconDownloadSmall() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
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
            {err.code ? `${err.code}: ` : ""}
            {err.message}
          </div>
          {err.traceId ? (
            <div className="lr-meta" style={{ marginTop: 6 }}>
              Trace: <span className="lr-mono">{err.traceId}</span>
            </div>
          ) : null}
        </div>

        <div style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}

function getParamsLike(job: ExportJob): ExportParamsLike {
  // ExportJob.params is Json? -> keep robust in UI
  const anyJob = job as unknown as { params?: unknown };
  const p = anyJob.params;
  if (p && typeof p === "object") return p as ExportParamsLike;
  return {};
}

export default function ExportsClient() {
  const [forms, setForms] = useState<FormListItem[]>([]);
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCreate, setBusyCreate] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [err, setErr] = useState<UiError | null>(null);

  const pollRef = useRef<number | null>(null);
  const pollingJobId = useRef<string | null>(null);

  // Auto-download only for the *just created* export job.
  const autoDownloadJobIdRef = useRef<string | null>(null);
  const autoDownloadInFlightRef = useRef<boolean>(false);

  const downloadJobCsv = useCallback(async (jobId: string) => {
    const { blob, filename } = await apiDownloadCsv(`/api/admin/v1/exports/${jobId}/download`);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const [formsRes, eventsRes, jobsRes] = await Promise.all([
        apiJson<{ forms: FormListItem[] }>("/api/admin/v1/forms"),
        apiJson<{ items: EventListItem[] }>("/api/admin/v1/events?status=ACTIVE"),
        apiJson<{ items: ExportJob[] }>("/api/admin/v1/exports?type=CSV&limit=50"),
      ]);

      setForms(formsRes.data.forms || []);
      setEvents(eventsRes.data.items || []);
      setJobs(jobsRes.data.items || []);
    } catch (e) {
      setErr(e as UiError);
    } finally {
      setLoading(false);
    }
  }, []);

  const startPolling = useCallback(
    (jobId: string) => {
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

          // Auto-download when the freshly created job finishes.
          if (
            job.status === "DONE" &&
            autoDownloadJobIdRef.current &&
            job.id === autoDownloadJobIdRef.current &&
            !autoDownloadInFlightRef.current
          ) {
            autoDownloadInFlightRef.current = true;
            try {
              await downloadJobCsv(job.id);
            } catch (e) {
              setErr(e as UiError);
            } finally {
              autoDownloadJobIdRef.current = null;
              autoDownloadInFlightRef.current = false;
            }
          }

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
    },
    [downloadJobCsv]
  );

  useEffect(() => {
    void loadAll();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [loadAll]);

  const jobRows = useMemo(() => jobs, [jobs]);

  const formNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of forms) m.set(f.id, f.name);
    return m;
  }, [forms]);

  const eventNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const ev of events) m.set(ev.id, ev.name);
    return m;
  }, [events]);

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

      {err ? <Notice err={err} onRetry={() => void loadAll()} onDismiss={() => setErr(null)} /> : null}

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
            {jobRows.map((j) => {
              const p = getParamsLike(j);
              const formLabel = p.formId ? (formNameById.get(p.formId) ?? p.formId) : null;
              const eventLabel = p.eventId ? (eventNameById.get(p.eventId) ?? p.eventId) : null;

              const filters: string[] = [];
              if (eventLabel) filters.push(`Event: ${eventLabel}`);
              if (formLabel) filters.push(`Form: ${formLabel}`);
              if (p.from || p.to) filters.push(`Range: ${p.from ?? "…"} → ${p.to ?? "…"}`);
              if (p.includeDeleted) filters.push("Include deleted");
              const filterSummary = filters.length ? filters.join(" · ") : "All leads";

              const canPoll = j.status !== "DONE" && j.status !== "FAILED";
              const canDownload = j.status === "DONE";

              return (
                <TableRow
                  key={j.id}
                  actions={
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startPolling(j.id)}
                        disabled={!canPoll}
                        title={canPoll ? "Check the job status now" : "Job is finished"}
                      >
                        <span className="inline-flex items-center gap-2">
                          <IconRefreshSmall />
                          Check status
                        </span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!canDownload}
                        title={canDownload ? "Download CSV" : "Available when status is DONE"}
                        onClick={async () => {
                          setErr(null);
                          try {
                            await downloadJobCsv(j.id);
                          } catch (e) {
                            setErr(e as UiError);
                          }
                        }}
                      >
                        <span className="inline-flex items-center gap-2">
                          <IconDownloadSmall />
                          Download CSV
                        </span>
                      </Button>
                    </>
                  }
                >
                  <TableCell>
                    <div className="lr-mono" style={{ fontSize: "12px" }}>
                      {j.id}
                    </div>
                    <div className="lr-meta" style={{ marginTop: 6 }}>
                      type: {j.type} · {filterSummary}
                    </div>
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
              );
            })}
          </TableBody>
        </Table>
      )}

      {modalOpen ? (
        <ExportCreateModal
          forms={forms}
          events={events}
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
                  eventId: values.eventId,
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

              // enable auto-download for the newly created export
              autoDownloadJobIdRef.current = created.id;

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