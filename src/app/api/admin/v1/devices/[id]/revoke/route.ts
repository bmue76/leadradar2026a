import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAdminAuth(req);
    const { id } = await ctxRoute.params;

    const device = await prisma.mobileDevice.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, apiKeyId: true },
    });
    if (!device) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.mobileApiKey.update({
        where: { id: device.apiKeyId },
        data: { status: "REVOKED", revokedAt: now },
        select: { id: true },
      });

      await tx.mobileDevice.update({
        where: { id: device.id },
        data: { status: "DISABLED" },
        select: { id: true },
      });
    });

    return jsonOk(req, { revoked: true });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
