import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenantContext";

export const runtime = "nodejs";

function toKeyDto(k: {
  id: string;
  name: string;
  prefix: string;
  status: "ACTIVE" | "REVOKED";
  createdAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}) {
  return {
    id: k.id,
    prefix: k.prefix,
    label: k.name,
    status: k.status,
    createdAt: k.createdAt.toISOString(),
    revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
  };
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const { tenantId } = await requireTenantContext(req);
    const id = (ctx.params.id ?? "").trim();
    if (!id) throw httpError(404, "NOT_FOUND", "Not found.");

    const existing = await prisma.mobileApiKey.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) throw httpError(404, "NOT_FOUND", "Not found.");

    const now = new Date();

    const updated = await prisma.mobileApiKey.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: now },
      select: {
        id: true,
        name: true,
        prefix: true,
        status: true,
        createdAt: true,
        revokedAt: true,
        lastUsedAt: true,
      },
    });

    return jsonOk(req, { apiKey: toKeyDto(updated) });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
