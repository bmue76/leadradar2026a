import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { requireTenantContext } from "@/lib/tenantContext";
import { setEventStatusWithGuards } from "@/lib/eventsGuardrails";
import { NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

const PatchBody = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
});

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    const { tenantId } = await requireTenantContext(req);
    const { id } = await ctx.params;

    const body = await validateBody(req, PatchBody);

    const res = await setEventStatusWithGuards({
      tenantId,
      eventId: id,
      newStatus: body.status,
    });

    // API contract (TP 3.7)
    // - item
    // - autoArchivedEventId? (when activating)
    // - devicesUnboundCount? (when unbinding happened)
    return jsonOk(req, {
      item: res.item,
      autoArchivedEventId: res.autoArchivedEventId,
      devicesUnboundCount: res.devicesUnboundCount,
    });
  } catch (e) {
    // leak-safe
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

// Optional: if someone calls GET by mistake
export async function GET(req: NextRequest) {
  return jsonError(req, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
}
