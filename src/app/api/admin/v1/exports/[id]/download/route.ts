import { jsonError, getTraceId } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenantContext";
import { getAbsolutePath, fileExists, streamFileWeb, statFile } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const traceId = getTraceId(req);

  try {
    const { tenantId } = await requireTenantContext(req);
    const { id } = await ctx.params;

    const job = await prisma.exportJob.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        status: true,
        resultStorageKey: true,
        type: true,
      },
    });

    if (!job) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    if (job.status !== "DONE") return jsonError(req, 409, "NOT_READY", "Export is not ready yet.");
    if (!job.resultStorageKey) return jsonError(req, 409, "NOT_READY", "Export is not ready yet.");

    const abs = getAbsolutePath({ rootDirName: ".tmp_exports", relativeKey: job.resultStorageKey });
    const exists = await fileExists(abs);
    if (!exists) return jsonError(req, 404, "NO_FILE", "Export file not found.");

    const st = await statFile(abs);
    const stream = streamFileWeb(abs);

    const filename = `leadradar-export-${job.id}.csv`;

    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "content-length": String(st.sizeBytes),
        "x-trace-id": traceId,
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
