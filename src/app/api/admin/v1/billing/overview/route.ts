import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";
import { getBillingOverview } from "@/lib/billing/billingService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const ctx = await requireAdminAuth(req);
    const data = await getBillingOverview(ctx.tenantId);
    return jsonOk(req, data);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
