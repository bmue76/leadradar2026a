import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { getMobileBillingStatus } from "@/lib/billing/billingService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await requireMobileAuth(req);
    const data = await getMobileBillingStatus(auth.tenantId);
    return jsonOk(req, data);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
