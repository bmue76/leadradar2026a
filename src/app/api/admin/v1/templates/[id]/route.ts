import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

import { getTemplateDetailForTenant } from "../_repo";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminAuth(req);
    const { id } = await ctx.params;

    const detail = await getTemplateDetailForTenant({ tenantId: auth.tenantId, id });
    if (!detail) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    return jsonOk(req, { item: detail });
  } catch (e) {
    if (isHttpError(e)) {
      return jsonError(req, e.status, e.code, e.message, e.details);
    }
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
