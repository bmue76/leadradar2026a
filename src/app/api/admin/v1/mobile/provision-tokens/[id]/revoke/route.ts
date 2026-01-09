import { jsonOk, jsonError } from "@/lib/api";
import { httpError, isHttpError } from "@/lib/http";
import { requireTenantContext } from "@/lib/tenantContext";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { tenantId } = await requireTenantContext(req);
    const { id } = await ctx.params;

    const row = await prisma.mobileProvisionToken.findFirst({
      where: { id, tenantId },
      select: { id: true, prefix: true, status: true, expiresAt: true, usedAt: true, createdAt: true },
    });

    if (!row) throw httpError(404, "NOT_FOUND", "Not found.");

    // Idempotent-ish: if already USED/REVOKED, keep state.
    const next =
      row.status === "ACTIVE"
        ? await prisma.mobileProvisionToken.update({
            where: { id: row.id },
            data: { status: "REVOKED" },
            select: { id: true, prefix: true, status: true, expiresAt: true, usedAt: true, createdAt: true },
          })
        : row;

    return jsonOk(req, { provision: next });
  } catch (e: unknown) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error("POST /api/admin/v1/mobile/provision-tokens/:id/revoke failed", e);
    return jsonError(req, 500, "INTERNAL_ERROR", "Internal server error.");
  }
}
