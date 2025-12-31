import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { requireTenantContext } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const tenant = await requireTenantContext(req);

    return jsonOk(req, {
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
