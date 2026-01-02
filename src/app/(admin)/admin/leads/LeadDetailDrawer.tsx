"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetchJson as _adminFetchJson } from "../_lib/adminFetch";
import type {
  AdminFormListItem,
  AdminLeadDetail,
  ApiResponse,
} from "./leads.types";

type AdminFetchJsonFn = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
const adminFetchJson = _adminFetchJson as unknown as AdminFetchJsonFn;

function formatBytes(n?: number | null): string {
  if (!n || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    const allPrimitive = v.every((x) => ["string", "number", "boolean"].includes(typeof x) || x === null);
    if (allPrimitive) return v.map((x) => (x === null ? "" : String(x))).filter(Boolean).join(", ");
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  if (isPlainObject(v)) {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export default function LeadDetailDrawer(props: {
  open: boolean;
  leadId: string | null;
  onClose: () => void;
  formsById: Map<string, AdminFormListItem>;
  formatCapturedAt: (iso: string) => string;
  onMutated: (leadId: string) => void;
}) {
  const { open, leadId, onClose, formsById, formatCapturedAt, onMutated } = props;

  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [lead, setLead] = useState<AdminLeadDetail | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const formName = useMemo(() => {
    if (!lead) return null;
    return formsById.get(lead.formId)?.name ?? lead.formId;
  }, [formsById, lead]);

  const loadDetail = useCallback(async () => {
    if (!leadId) return;

    setState("loading");
    setErrorMessage("");
    setTraceId(null);

    try {
      const res = (await adminFetchJson<ApiResponse<AdminLeadDetail>>(
        `/api/admin/v1/leads/${leadId}`,
        { method: "GET" }
      )) as ApiResponse<AdminLeadDetail>;

      if (!res.ok) {
        setState("error");
        setTraceId(res.traceId ?? null);
        setErrorMessage(res.error?.message || "Failed to load lead detail.");
        return;
      }

      setLead(res.data);
      setState("idle");
    } catch (e) {
      setState("error");
      setErrorMessage(e instanceof Error ? e.message : "Failed to load lead detail.");
    }
  }, [leadId]);

  useEffect(() => {
    if (!open) return;
    void loadDetail();
  }, [open, loadDetail]);

  const doDelete = useCallback(async () => {
    if (!leadId) return;
    const ok = window.confirm("Soft-delete this lead? (You can restore only if restore is enabled.)");
    if (!ok) return;

    setErrorMessage("");
    setTraceId(null);

    try {
      const res = (await adminFetchJson<ApiResponse<{ id: string } | AdminLeadDetail>>(
        `/api/admin/v1/leads/${leadId}`,
        { method: "DELETE" }
      )) as ApiResponse<{ id: string } | AdminLeadDetail>;

      if (!res.ok) {
        setTraceId(res.traceId ?? null);
        setErrorMessage(res.error?.message || "Delete failed.");
        return;
      }

      // Optimistic: mark lead deleted locally (detail refresh afterwards).
      setLead((prev) => (prev ? { ...prev, isDeleted: true } : prev));
      onMutated(leadId);
      void loadDetail();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Delete failed.");
    }
  }, [leadId, loadDetail, onMutated]);

  const doRestore = useCallback(async () => {
    if (!leadId) return;
    const ok = window.confirm("Restore this lead?");
    if (!ok) return;

    setErrorMessage("");
    setTraceId(null);

    try {
      const res = (await adminFetchJson<ApiResponse<{ id: string } | AdminLeadDetail>>(
        `/api/admin/v1/leads/${leadId}/restore`,
        { method: "POST" }
      )) as ApiResponse<{ id: string } | AdminLeadDetail>;

      if (!res.ok) {
        // Endpoint might not exist yet (optional in TP 1.6). Show a friendly message.
        setTraceId(res.traceId ?? null);
        setErrorMessage(
          res.error?.code === "NOT_FOUND"
            ? "Restore is not available yet in this environment."
            : (res.error?.message || "Restore failed.")
        );
        return;
      }

      setLead((prev) => (prev ? { ...prev, isDeleted: false } : prev));
      onMutated(leadId);
      void loadDetail();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Restore failed.");
    }
  }, [leadId, loadDetail, onMutated]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-label="Close"
      />

      {/* panel */}
      <div className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Lead</h2>
              {lead?.isDeleted ? (
                <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800">
                  Deleted
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-black/10 bg-black/5 px-2 py-1 text-xs font-medium text-black/70">
                  Active
                </span>
              )}
            </div>
            <div className="mt-1 text-sm text-black/60">
              {lead?.capturedAt ? formatCapturedAt(lead.capturedAt) : "—"}
              {lead?.formId ? (
                <>
                  {" · "}
                  <span className="font-medium text-black/75">{formName}</span>
                </>
              ) : null}
            </div>
            {leadId && (
              <div className="mt-1 truncate text-xs text-black/40">id: {leadId}</div>
            )}
          </div>

          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-black/5"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="px-5 py-4">
          {state === "loading" && <DetailSkeleton />}

          {state === "error" && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="font-semibold text-red-800">Could not load lead.</div>
              <div className="mt-1 text-sm text-red-800/80">{errorMessage || "Something went wrong."}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm hover:bg-white/60"
                  onClick={() => void loadDetail()}
                >
                  Retry
                </button>
                {traceId && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-800/70">traceId: {traceId}</span>
                    <button
                      type="button"
                      className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs hover:bg-white/60"
                      onClick={() => void navigator.clipboard.writeText(traceId)}
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {state === "idle" && lead && (
            <>
              {(errorMessage || traceId) && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="font-medium text-amber-900">Action issue</div>
                  <div className="mt-1 text-sm text-amber-900/80">{errorMessage}</div>
                  {traceId && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-amber-900/70">traceId: {traceId}</span>
                      <button
                        type="button"
                        className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs hover:bg-white/60"
                        onClick={() => void navigator.clipboard.writeText(traceId)}
                      >
                        Copy
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
                  onClick={() => void doDelete()}
                  disabled={lead.isDeleted}
                  title={lead.isDeleted ? "Already deleted" : "Soft-delete"}
                >
                  Delete
                </button>

                <button
                  type="button"
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50"
                  onClick={() => void doRestore()}
                  disabled={!lead.isDeleted}
                  title={!lead.isDeleted ? "Only available for deleted leads" : "Restore (if enabled)"}
                >
                  Restore
                </button>

                <div className="text-xs text-black/40">
                  Restore is optional (depends on API availability).
                </div>
              </div>

              {/* Values */}
              <section className="rounded-xl border bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Values</h3>
                  <span className="text-xs text-black/50">
                    {lead.values && typeof lead.values === "object" ? Object.keys(lead.values).length : 0} fields
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {lead.values && typeof lead.values === "object" && Object.keys(lead.values).length > 0 ? (
                    Object.keys(lead.values)
                      .sort((a, b) => a.localeCompare(b))
                      .map((k) => {
                        const v = (lead.values as Record<string, unknown>)[k];
                        const text = formatValue(v);
                        return (
                          <div key={k} className="grid grid-cols-12 gap-3 border-b pb-3 last:border-b-0 last:pb-0">
                            <div className="col-span-4 text-sm font-medium text-black/70">
                              <div className="break-words">{k}</div>
                            </div>
                            <div className="col-span-8">
                              {text.includes("\n") ? (
                                <pre className="whitespace-pre-wrap break-words rounded-md bg-black/[0.03] p-2 text-sm text-black/80">
                                  {text}
                                </pre>
                              ) : (
                                <div className="break-words text-sm text-black/80">{text || "—"}</div>
                              )}
                            </div>
                          </div>
                        );
                      })
                  ) : (
                    <div className="text-sm text-black/60">No values.</div>
                  )}
                </div>
              </section>

              {/* Attachments */}
              <section className="mt-4 rounded-xl border bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Attachments</h3>
                  <span className="text-xs text-black/50">
                    {lead.attachments?.length ?? 0} file(s)
                  </span>
                </div>

                {lead.attachments && lead.attachments.length > 0 ? (
                  <div className="space-y-2">
                    {lead.attachments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{a.filename}</div>
                          <div className="mt-0.5 text-xs text-black/50">
                            {a.type}
                            {a.mimeType ? ` · ${a.mimeType}` : ""}
                            {typeof a.sizeBytes === "number" ? ` · ${formatBytes(a.sizeBytes)}` : ""}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="rounded-md border px-3 py-1.5 text-sm opacity-60"
                          disabled
                          title="Download coming later"
                        >
                          Download
                        </button>
                      </div>
                    ))}
                    <div className="text-xs text-black/40">Download is coming later (exports/storage step).</div>
                  </div>
                ) : (
                  <div className="text-sm text-black/60">No attachments.</div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-24 animate-pulse rounded-xl bg-black/10" />
      <div className="h-48 animate-pulse rounded-xl bg-black/10" />
      <div className="h-28 animate-pulse rounded-xl bg-black/10" />
    </div>
  );
}
