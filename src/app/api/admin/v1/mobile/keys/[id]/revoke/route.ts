import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenantContext";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

function mapApiKeyDto(k: {
  id: string;
  name: string;
  prefix: string;
  status: string;
  createdAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  device?: { id: string; name: string; status: string; lastSeenAt: Date | null } | null;
}) {
  return {
    id: k.id,
    prefix: k.prefix,
    label: k.name,
    status: k.status,
    createdAt: k.createdAt,
    revokedAt: k.revokedAt,
    lastUsedAt: k.lastUsedAt,
    device: k.device
      ? { id: k.device.id, name: k.device.name, status: k.device.status, lastSeenAt: k.device.lastSeenAt }
      : null,
  };
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const { tenantId } = await requireTenantContext(req);
    const { id } = await ctx.params;

    const existing = await prisma.mobileApiKey.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        name: true,
        prefix: true,
        status: true,
        createdAt: true,
        revokedAt: true,
        lastUsedAt: true,
        device: { select: { id: true, name: true, status: true, lastSeenAt: true } },
      },
    });

    if (!existing) throw httpError(404, "NOT_FOUND", "Not found.");

    if (existing.status !== "REVOKED") {
      await prisma.mobileApiKey.updateMany({
        where: { id, tenantId, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
    }

    const updated = await prisma.mobileApiKey.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        name: true,
        prefix: true,
        status: true,
        createdAt: true,
        revokedAt: true,
        lastUsedAt: true,
        device: { select: { id: true, name: true, status: true, lastSeenAt: true } },
      },
    });

    // Should exist because we already had it, but keep leak-safe behavior.
    if (!updated) throw httpError(404, "NOT_FOUND", "Not found.");

    return jsonOk(req, { apiKey: mapApiKeyDto(updated) });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
