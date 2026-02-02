import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant";

export const runtime = "nodejs";

/**
 * TP 5.7 (MVP): Review stored in Lead.meta.reviewedAt (ISO string).
 * reviewed=true  -> meta.reviewedAt = now ISO
 * reviewed=false -> remove meta.reviewedAt
 */

const BodySchema = z
  .object({
    reviewed: z.boolean(),
  })
  .strict();

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

async function resolveTenantIdForAdmin(req: Request): Promise<string> {
  try {
    const auth = await requireAdminAuth(req);
    return auth.tenantId;
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      const t = await requireTenantContext(req);
      return t.id;
    }
    throw e;
  }
}

function setReviewedAt(
  meta: Prisma.JsonValue | null,
  reviewed: boolean
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  const base: Record<string, unknown> = isRecord(meta) ? { ...(meta as Record<string, unknown>) } : {};
  if (reviewed) base.reviewedAt = new Date().toISOString();
  else delete base.reviewedAt;

  // No keys left -> clear meta (DB null)
  if (Object.keys(base).length === 0) return Prisma.DbNull;

  return base as Prisma.InputJsonValue;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const tenantId = await resolveTenantIdForAdmin(req);
    const body = await validateBody(req, BodySchema);

    const existing = await prisma.lead.findFirst({
      where: { id, tenantId },
      select: { id: true, meta: true },
    });
    if (!existing) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const nextMeta = setReviewedAt((existing.meta ?? null) as Prisma.JsonValue | null, body.reviewed);

    await prisma.lead.update({
      where: { id: existing.id },
      data: { meta: nextMeta },
      select: { id: true },
    });

    return jsonOk(req, {
      id: existing.id,
      reviewed: body.reviewed,
      reviewedAt: body.reviewed ? new Date().toISOString() : null,
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL", "Unexpected server error.");
  }
}
