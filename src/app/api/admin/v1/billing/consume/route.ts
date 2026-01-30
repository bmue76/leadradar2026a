import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";
import { consumeCreditAdmin } from "@/lib/billing/billingService";
import type { ConsumeAction } from "@/lib/billing/billingTypes";

export const runtime = "nodejs";

const BodySchema = z.object({
  action: z.enum(["ACTIVATE_LICENSE_30D", "ACTIVATE_LICENSE_365D", "ADD_DEVICE_SLOT"]),
});

export async function POST(req: Request) {
  try {
    const ctx = await requireAdminAuth(req);
    const body = await validateBody(req, BodySchema, 16 * 1024);

    const data = await consumeCreditAdmin(ctx.tenantId, body.action as ConsumeAction);
    return jsonOk(req, data);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
