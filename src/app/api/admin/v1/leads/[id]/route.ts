import { z } from "zod";
import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/api";
import { validateBody, isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant";

export const runtime = "nodejs";

const DeleteLeadBodySchema = z.object({
  reason: z
    .preprocess((v: unknown) => (typeof v === "string" ? v.trim() : v), z.string().min(1).max(256))
    .optional(),
});

function toIso(d?: Date | null): string | null {
  return d ? d.toISOString() : null;
}

async function resolveTenantIdForAdmin(req: Request): Promise<string> {
  // Prefer session auth (prod)
  try {
    const auth = await requireAdminAuth(req);
    return auth.tenantId;
  } catch (e) {
    // DEV fallback (allows curl proof via x-tenant-slug)
    if (process.env.NODE_ENV !== "production") {
      const t = await requireTenantContext(req);
      return t.id;
    }
    throw e;
  }
}

function serializeLead(lead: {
  id: string;
  formId: string;
  eventId: string | null;
  capturedAt: Date;
  values: unknown;
  meta: unknown | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedReason: string | null;
  deletedByUserId: string | null;
  form: { id: string; name: string } | null;
  attachments: Array<{
    id: string;
    type: string;
    filename: string;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: Date;
  }>;
}) {
  return {
    id: lead.id,
    formId: lead.formId,
    eventId: lead.eventId ?? null,

    capturedAt: toIso(lead.capturedAt),
    createdAt: toIso(lead.capturedAt),
    updatedAt: toIso(lead.capturedAt),

    values: lead.values ?? {},
    meta: lead.meta ?? null,

    isDeleted: Boolean(lead.isDeleted),
    deletedAt: toIso(lead.deletedAt),
    deletedReason: lead.deletedReason ?? null,
    deletedByUserId: lead.deletedByUserId ?? null,

    form: lead.form ? { id: lead.form.id, name: lead.form.name } : null,

    attachments: (lead.attachments ?? []).map((a) => ({
      id: a.id,
      type: a.type,
      filename: a.filename,
      mimeType: a.mimeType ?? null,
      sizeBytes: typeof a.sizeBytes === "number" ? a.sizeBytes : null,
      createdAt: toIso(a.createdAt),
    })),
  };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const tenantId = await resolveTenantIdForAdmin(req);

    const lead = await prisma.lead.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        formId: true,
        eventId: true,
        capturedAt: true,
        values: true,
        meta: true,
        isDeleted: true,
        deletedAt: true,
        deletedReason: true,
        deletedByUserId: true,
        form: { select: { id: true, name: true } },
        attachments: {
          orderBy: { createdAt: "desc" },
          select: { id: true, type: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
    });

    if (!lead) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    return jsonOk(req, serializeLead(lead));
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL", "Unexpected server error.");
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const tenantId = await resolveTenantIdForAdmin(req);
    const body = await validateBody(req, DeleteLeadBodySchema);

    const existing = await prisma.lead.findFirst({
      where: { id, tenantId },
      select: { id: true, isDeleted: true },
    });
    if (!existing) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    if (!existing.isDeleted) {
      const updated = await prisma.lead.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date(), deletedReason: body.reason ?? null },
        select: { tenantId: true },
      });
      if (updated.tenantId !== tenantId) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    const lead = await prisma.lead.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        formId: true,
        eventId: true,
        capturedAt: true,
        values: true,
        meta: true,
        isDeleted: true,
        deletedAt: true,
        deletedReason: true,
        deletedByUserId: true,
        form: { select: { id: true, name: true } },
        attachments: {
          orderBy: { createdAt: "desc" },
          select: { id: true, type: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
    });

    if (!lead) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    return jsonOk(req, serializeLead(lead));
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL", "Unexpected server error.");
  }
}
