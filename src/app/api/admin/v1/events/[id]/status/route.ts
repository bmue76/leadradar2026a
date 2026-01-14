import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody } from "@/lib/http";
import { requireTenantContext } from "@/lib/tenantContext";
import { setEventStatusWithGuards } from "@/lib/eventsGuardrails";
import { NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantContext(req);
    const { id } = await ctx.params;

    const body = await validateBody(req, BodySchema);

    const result = await setEventStatusWithGuards({
      tenantId,
      eventId: id,
      newStatus: body.status,
    });

    return jsonOk(req, result);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
