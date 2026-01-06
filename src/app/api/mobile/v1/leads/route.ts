import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenantContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Primitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const PrimitiveOrArray = z.union([Primitive, z.array(Primitive)]);

const PostLeadBodySchema = z.object({
  formId: z.string().min(1),
  clientLeadId: z.string().min(1).max(128),
  capturedAt: z.string().datetime(),
  values: z.record(z.string(), PrimitiveOrArray),
  meta: z.record(z.string(), z.unknown()).optional(),
});

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantContext(req);
    const body = await validateBody(req, PostLeadBodySchema, 256 * 1024);

    // leak-safe: form must exist for tenant and must be ACTIVE
    const form = await prisma.form.findFirst({
      where: { id: body.formId, tenantId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!form) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const capturedAt = new Date(body.capturedAt);

    try {
      const created = await prisma.lead.create({
        data: {
          tenantId,
          formId: body.formId,
          clientLeadId: body.clientLeadId,
          capturedAt,
          values: body.values as Prisma.InputJsonValue,
          meta: (body.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        },
        select: { id: true },
      });

      return jsonOk(req, { leadId: created.id, deduped: false });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;

      const existing = await prisma.lead.findFirst({
        where: { tenantId, clientLeadId: body.clientLeadId },
        select: { id: true },
      });
      if (!existing) return jsonError(req, 409, "KEY_CONFLICT", "Duplicate clientLeadId.");

      return jsonOk(req, { leadId: existing.id, deduped: true });
    }
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error("[mobile.v1.leads] POST unexpected error", e);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
