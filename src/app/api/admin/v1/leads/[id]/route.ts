import { z } from "zod";
import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/api";
import { validateBody, isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const DeleteLeadBodySchema = z.object({
  reason: z
    .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1).max(256))
    .optional(),
});

function withDerivedTimestamps<T extends { capturedAt?: Date }>(lead: T) {
  // Contract alignment: createdAt/updatedAt are derived from capturedAt in MVP
  return {
    ...lead,
    createdAt: lead.capturedAt ?? null,
    updatedAt: lead.capturedAt ?? null,
  };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await requireAdminAuth(req);
    const { id } = await ctx.params;

    const lead = await prisma.lead.findFirst({
      where: { id, tenantId: tenant.tenantId },
      include: {
        form: { select: { id: true, name: true } },
        attachments: { orderBy: { id: "desc" } },
      },
    });

    if (!lead) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    return jsonOk(req, { lead: withDerivedTimestamps(lead) });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_SERVER_ERROR", "Unexpected server error.");
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await requireAdminAuth(req);
    const { id } = await ctx.params;

    const body = await validateBody(req, DeleteLeadBodySchema);

    const existing = await prisma.lead.findFirst({
      where: { id, tenantId: tenant.tenantId },
      select: { id: true, isDeleted: true },
    });

    if (!existing) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    // idempotent
    if (existing.isDeleted) {
      const lead = await prisma.lead.findFirst({
        where: { id, tenantId: tenant.tenantId },
        include: { form: { select: { id: true, name: true } }, attachments: { orderBy: { id: "desc" } } },
      });
      if (!lead) return jsonError(req, 404, "NOT_FOUND", "Not found.");
      return jsonOk(req, { lead: withDerivedTimestamps(lead) });
    }

    const lead = await prisma.lead.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedReason: body.reason ?? null,
      },
      include: {
        form: { select: { id: true, name: true } },
        attachments: { orderBy: { id: "desc" } },
      },
    });

    // defensive leak-safe
    if (lead.tenantId !== tenant.tenantId) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    return jsonOk(req, { lead: withDerivedTimestamps(lead) });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_SERVER_ERROR", "Unexpected server error.");
  }
}
