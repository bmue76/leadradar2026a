import { z } from "zod";
import { jsonOk, jsonError, getTraceId } from "@/lib/api";
import { isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";
import { runCsvExport } from "@/lib/exportCsv";

export const runtime = "nodejs";

const BodySchema = z.object({
  formId: z.string().min(1).optional(),
  includeDeleted: z.boolean().optional().default(false),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(100000).optional(),
});

export async function POST(req: Request) {
  const traceId = getTraceId(req);

  try {
    const { tenantId } = await requireAdminAuth(req);
    const body = await validateBody(req, BodySchema);

    // 1) create job QUEUED
    const job = await prisma.exportJob.create({
      data: {
        tenantId,
        type: "CSV",
        status: "QUEUED",
        params: {
          scope: "LEADS",
          includeDeleted: body.includeDeleted ?? false,
          formId: body.formId ?? null,
          from: body.from ?? null,
          to: body.to ?? null,
          limit: body.limit ?? 10000,
          delimiter: ";",
          columnsVersion: 1,
          traceId,
        },
        queuedAt: new Date(),
      },
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

    // 2) best-effort immediate processing (MVP: inline)
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    try {
      const res = await runCsvExport({
        tenantId,
        jobId: job.id,
        params: {
          formId: body.formId ?? null,
          includeDeleted: body.includeDeleted ?? false,
          from: body.from ?? null,
          to: body.to ?? null,
          limit: body.limit ?? 10000,
          delimiter: ";",
        },
      });

      const done = await prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: "DONE",
          resultStorageKey: res.relativeStorageKey,
          finishedAt: new Date(),
          params: {
            ...(typeof job.params === "object" && job.params ? job.params : {}),
            rowCount: res.rowCount,
            delimiter: res.delimiter,
          },
        },
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

      return jsonOk(req, { job: done });
    } catch (inner) {
      await prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          params: {
            ...(typeof job.params === "object" && job.params ? job.params : {}),
            error: {
              message: inner instanceof Error ? inner.message : "Export failed.",
            },
          },
        },
      });

      return jsonError(req, 500, "EXPORT_FAILED", "CSV export failed.");
    }
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
