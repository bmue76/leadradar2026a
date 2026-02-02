import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

import { getExportJobById } from "../_repo";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminAuth(req);
    const tenantId = auth.tenantId;

    const { id } = await ctx.params;

    const job = await getExportJobById(tenantId, id);
    if (!job) return jsonError(req, 404, "NOT_FOUND", "Export not found.");

    return jsonOk(req, {
      job: {
        id: job.id,
        status: job.status,
        type: job.type,
        params: job.params ?? {},
        resultStorageKey: job.resultStorageKey,
        queuedAt: job.queuedAt ? job.queuedAt.toISOString() : null,
        startedAt: job.startedAt ? job.startedAt.toISOString() : null,
        finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
        updatedAt: job.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
