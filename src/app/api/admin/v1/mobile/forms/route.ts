import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateQuery } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenantContext";
import { z } from "zod";

export const runtime = "nodejs";

const QuerySchema = z.object({
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED", "ALL"]).optional(),
});

export async function GET(req: Request) {
  try {
    const { tenantId } = await requireTenantContext(req);
    const q = await validateQuery(req, QuerySchema);

    const status = (q.status ?? "ACTIVE").toString();
    const where =
      status === "ALL"
        ? { tenantId }
        : { tenantId, status: status as "ACTIVE" | "DRAFT" | "ARCHIVED" };

    const forms = await prisma.form.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 500,
      select: { id: true, name: true, status: true, createdAt: true },
    });

    return jsonOk(req, {
      items: forms.map((f) => ({
        id: f.id,
        name: f.name,
        status: f.status,
        createdAt: f.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
