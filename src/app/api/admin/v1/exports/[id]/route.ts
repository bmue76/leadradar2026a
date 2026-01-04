import { jsonOk, jsonError } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const { id } = await ctx.params;

    const job = await prisma.exportJob.findFirst({
      where: { id, tenantId },
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

    if (!job) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    return jsonOk(req, { job });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
