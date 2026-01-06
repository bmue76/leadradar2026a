import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { requireTenantContext } from "@/lib/tenantContext";
import { adminRevokeMobileApiKey } from "@/lib/mobileAuth";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const t = await requireTenantContext(req);

    const res = await adminRevokeMobileApiKey({ tenantId: t.tenantId, id });

    return jsonOk(req, res);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
