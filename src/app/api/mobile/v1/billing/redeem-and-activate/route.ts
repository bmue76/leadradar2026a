import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { redeemAndActivateMobile } from "@/lib/billing/billingService";

export const runtime = "nodejs";

const BodySchema = z.object({
  code: z.string().min(1).max(80),
});

export async function POST(req: Request) {
  try {
    const auth = await requireMobileAuth(req);
    const body = await validateBody(req, BodySchema, 16 * 1024);

    const data = await redeemAndActivateMobile(auth.tenantId, body.code);
    return jsonOk(req, data);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
