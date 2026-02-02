import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { getTraceId, jsonError, jsonOk } from "@/lib/api";
import { validateBody, validateQuery, isHttpError } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

import {
  createExportJob,
  getExportJobById,
  listExportJobs,
  markExportJobDone,
  markExportJobFailed,
  markExportJobRunning,
  type ExportJobParams,
  type ExportStatus,
} from "./_repo";
import { runCsvExportCreate } from "./_csv";

export const runtime = "nodejs";

const ListQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  status: z.enum(["ALL", "QUEUED", "RUNNING", "DONE", "FAILED"]).default("ALL"),
});

const CreateBodySchema = z.object({
  scope: z.enum(["ACTIVE_EVENT", "ALL"]).default("ACTIVE_EVENT"),
  leadStatus: z.enum(["ALL", "NEW", "REVIEWED"]).default("ALL"),
  q: z.string().trim().min(1).max(200).optional(),
  format: z.literal("CSV").optional().default("CSV"),
});

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mergeParams(oldParams: Prisma.JsonValue | null | undefined, patch: Partial<ExportJobParams>): ExportJobParams {
  const base: Record<string, unknown> = isRecord(oldParams) ? oldParams : {};
  return { ...(base as unknown as ExportJobParams), ...patch } as ExportJobParams;
}

export async function GET(req: Request) {
  try {
    const auth = await requireAdminAuth(req);
    const tenantId = auth.tenantId;

    const query = await validateQuery(req, ListQuerySchema);

    const res = await listExportJobs({
      tenantId,
      take: query.take,
      cursor: query.cursor,
      status: query.status as "ALL" | ExportStatus,
    });

    return jsonOk(req, res);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function POST(req: Request) {
  const traceId = getTraceId(req);

  try {
    const auth = await requireAdminAuth(req);
    const tenantId = auth.tenantId;

    const body = await validateBody(req, CreateBodySchema);

    const params: ExportJobParams = {
      scope: body.scope,
      leadStatus: body.leadStatus,
      q: body.q,
      title: "Export",
    };

    const job = await createExportJob(tenantId, params);

    const okRunning = await markExportJobRunning(tenantId, job.id);
    if (!okRunning) return jsonError(req, 404, "NOT_FOUND", "Export job not found.");

    try {
      const result = await runCsvExportCreate({
        tenantId,
        traceId,
        jobId: job.id,
        params,
      });

      const fresh = await getExportJobById(tenantId, job.id);
      const merged = mergeParams(fresh?.params ?? null, result.paramsPatch);

      const okDone = await markExportJobDone(tenantId, job.id, result.storageKey, merged);
      if (!okDone) return jsonError(req, 404, "NOT_FOUND", "Export job not found.");

      return jsonOk(req, { job: { id: job.id, status: "DONE" as const } });
    } catch (inner: unknown) {
      // Map GoLive-safe
      const msg = inner instanceof Error ? inner.message : "";
      if (msg === "NO_ACTIVE_EVENT") {
        const fresh = await getExportJobById(tenantId, job.id);
        const merged = mergeParams(fresh?.params ?? null, {
          title: "Aktives Event – Export",
          lastErrorMessage: "Kein aktives Event vorhanden.",
          lastErrorTraceId: traceId,
        });
        await markExportJobFailed(tenantId, job.id, merged);
        return jsonError(req, 409, "NO_ACTIVE_EVENT", "Kein aktives Event vorhanden.");
      }

      const fresh = await getExportJobById(tenantId, job.id);
      const merged = mergeParams(fresh?.params ?? null, {
        lastErrorMessage: "Export fehlgeschlagen.",
        lastErrorTraceId: traceId,
      });
      await markExportJobFailed(tenantId, job.id, merged);

      return jsonError(req, 500, "EXPORT_FAILED", "Export fehlgeschlagen.");
    }
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
