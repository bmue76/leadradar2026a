export type ExportJobStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";

export type ExportJob = {
  id: string;
  tenantId: string;
  type: string; // "CSV"
  status: ExportJobStatus;
  params: unknown;
  resultStorageKey: string | null;
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type FormListItem = {
  id: string;
  name: string;
  status?: string;
};

export type ApiOk<T> = { ok: true; data: T; traceId: string };
export type ApiErr = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  traceId: string;
};

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("de-CH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

export function statusLabel(s: ExportJobStatus): string {
  switch (s) {
    case "QUEUED":
      return "Queued";
    case "RUNNING":
      return "Running";
    case "DONE":
      return "Done";
    case "FAILED":
      return "Failed";
    default:
      return s;
  }
}
