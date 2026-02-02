import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ExportStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";

export type ExportJobParams = {
  scope: "ACTIVE_EVENT" | "ALL";
  leadStatus: "ALL" | "NEW" | "REVIEWED";
  q?: string;

  title: string;
  rowCount?: number;
  fileName?: string;

  activeEventId?: string;
  activeEventName?: string;

  lastErrorMessage?: string;
  lastErrorTraceId?: string;
};

export type ExportJobListItem = {
  id: string;
  status: ExportStatus;
  createdAt: string;
  updatedAt: string;
  title: string;
  rowCount?: number;
  fileName?: string;
  fileUrl?: string;
  errorMessage?: string;
  errorTraceId?: string;
  filters: {
    scope: "ACTIVE_EVENT" | "ALL";
    leadStatus: "ALL" | "NEW" | "REVIEWED";
    q?: string;
  };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readString(r: Record<string, unknown>, k: string): string | undefined {
  const v = r[k];
  return typeof v === "string" ? v : undefined;
}
function readNumber(r: Record<string, unknown>, k: string): number | undefined {
  const v = r[k];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function parseParams(v: Prisma.JsonValue | null | undefined): Partial<ExportJobParams> {
  if (!v || !isRecord(v)) return {};
  const r = v;

  const scope = r.scope === "ACTIVE_EVENT" || r.scope === "ALL" ? (r.scope as "ACTIVE_EVENT" | "ALL") : undefined;
  const leadStatus =
    r.leadStatus === "ALL" || r.leadStatus === "NEW" || r.leadStatus === "REVIEWED"
      ? (r.leadStatus as "ALL" | "NEW" | "REVIEWED")
      : undefined;

  return {
    scope,
    leadStatus,
    q: readString(r, "q"),
    title: readString(r, "title"),
    rowCount: readNumber(r, "rowCount"),
    fileName: readString(r, "fileName"),
    activeEventId: readString(r, "activeEventId"),
    activeEventName: readString(r, "activeEventName"),
    lastErrorMessage: readString(r, "lastErrorMessage"),
    lastErrorTraceId: readString(r, "lastErrorTraceId"),
  };
}

export async function createExportJob(tenantId: string, params: ExportJobParams) {
  const now = new Date();
  return await prisma.exportJob.create({
    data: {
      tenantId,
      type: "CSV",
      status: "QUEUED",
      params: params as unknown as Prisma.InputJsonValue,
      queuedAt: now,
      startedAt: null,
      finishedAt: null,
      resultStorageKey: null,
    },
    select: {
      id: true,
      tenantId: true,
      status: true,
      params: true,
      queuedAt: true,
      updatedAt: true,
    },
  });
}

export async function markExportJobRunning(tenantId: string, id: string) {
  const now = new Date();
  const res = await prisma.exportJob.updateMany({
    where: { tenantId, id },
    data: { status: "RUNNING", startedAt: now },
  });
  return res.count === 1;
}

export async function markExportJobDone(tenantId: string, id: string, resultStorageKey: string, params: ExportJobParams) {
  const now = new Date();
  const res = await prisma.exportJob.updateMany({
    where: { tenantId, id },
    data: {
      status: "DONE",
      finishedAt: now,
      resultStorageKey,
      params: params as unknown as Prisma.InputJsonValue,
    },
  });
  return res.count === 1;
}

export async function markExportJobFailed(tenantId: string, id: string, params: ExportJobParams) {
  const now = new Date();
  const res = await prisma.exportJob.updateMany({
    where: { tenantId, id },
    data: {
      status: "FAILED",
      finishedAt: now,
      params: params as unknown as Prisma.InputJsonValue,
    },
  });
  return res.count === 1;
}

export async function getExportJobById(tenantId: string, id: string) {
  return await prisma.exportJob.findFirst({
    where: { tenantId, id },
    select: {
      id: true,
      tenantId: true,
      type: true,
      status: true,
      params: true,
      resultStorageKey: true,
      queuedAt: true,
      startedAt: true,
      finishedAt: true,
      updatedAt: true,
    },
  });
}

export async function listExportJobs(args: {
  tenantId: string;
  take: number;
  cursor?: string;
  status: "ALL" | ExportStatus;
}) {
  const { tenantId, take, cursor, status } = args;

  const where: Prisma.ExportJobWhereInput = { tenantId };
  if (status !== "ALL") {
    where.status = status as unknown as Prisma.ExportJobWhereInput["status"];
  }

  const rows = await prisma.exportJob.findMany({
    where,
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      status: true,
      params: true,
      resultStorageKey: true,
      queuedAt: true,
      updatedAt: true,
    },
  });

  const hasMore = rows.length > take;
  const slice = rows.slice(0, take);
  const nextCursor = hasMore ? slice[slice.length - 1]?.id : undefined;

  const items: ExportJobListItem[] = slice.map((j) => {
    const p = parseParams(j.params);

    const scope = p.scope ?? "ACTIVE_EVENT";
    const leadStatus = p.leadStatus ?? "ALL";
    const title = p.title ?? "Export";

    const createdAt = (j.queuedAt ?? j.updatedAt).toISOString();
    const updatedAt = j.updatedAt.toISOString();

    const fileUrl = j.status === "DONE" && j.resultStorageKey ? `/api/admin/v1/exports/${j.id}/download` : undefined;

    return {
      id: j.id,
      status: (j.status as unknown as ExportStatus) ?? "QUEUED",
      createdAt,
      updatedAt,
      title,
      rowCount: p.rowCount,
      fileName: p.fileName,
      fileUrl,
      errorMessage: p.lastErrorMessage,
      errorTraceId: p.lastErrorTraceId,
      filters: {
        scope,
        leadStatus,
        q: p.q,
      },
    };
  });

  return { items, nextCursor };
}
