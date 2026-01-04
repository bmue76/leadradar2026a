import { z } from "zod";
import { jsonOk, jsonError } from "@/lib/api";
import { isHttpError, validateQuery } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const QuerySchema = z.object({
  type: z.enum(["CSV"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const q = await validateQuery(req, QuerySchema);
    const limit = q.limit ?? 50;

    const items = await prisma.exportJob.findMany({
      where: {
        tenantId,
        ...(q.type ? { type: q.type } : {}),
      },
      orderBy: [{ queuedAt: "desc" }, { updatedAt: "desc" }],
      take: limit,
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

    return jsonOk(req, { items });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
