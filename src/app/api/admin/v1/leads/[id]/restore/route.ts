import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

function withDerivedTimestamps<T extends { capturedAt?: Date }>(lead: T) {
  return {
    ...lead,
    createdAt: lead.capturedAt ?? null,
    updatedAt: lead.capturedAt ?? null,
  };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await requireAdminAuth(req);
    const { id } = await ctx.params;

    const existing = await prisma.lead.findFirst({
      where: { id, tenantId: tenant.tenantId },
      select: { id: true },
    });
    if (!existing) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const lead = await prisma.lead.update({
      where: { id },
      data: { isDeleted: false, deletedAt: null, deletedReason: null },
      include: {
        form: { select: { id: true, name: true } },
        attachments: { orderBy: { id: "desc" } },
      },
    });

    if (lead.tenantId !== tenant.tenantId) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    return jsonOk(req, { lead: withDerivedTimestamps(lead) });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_SERVER_ERROR", "Unexpected server error.");
  }
}
