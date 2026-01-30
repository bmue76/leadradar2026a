import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateQuery } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

import { listTemplatesForTenant } from "./_repo";

export const runtime = "nodejs";

const QuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  category: z.string().trim().optional().default("ALL"),
  source: z.enum(["ALL", "SYSTEM", "TENANT"]).optional().default("ALL"),
  sort: z.enum(["updatedAt", "name"]).optional().default("updatedAt"),
  dir: z.enum(["asc", "desc"]).optional().default("desc"),
});

export async function GET(req: Request) {
  try {
    const auth = await requireAdminAuth(req);

    const q = await validateQuery(req, QuerySchema);

    const items = await listTemplatesForTenant({
      tenantId: auth.tenantId,
      q: q.q,
      category: q.category,
      source: q.source,
      sort: q.sort,
      dir: q.dir,
    });

    return jsonOk(req, { items });
  } catch (e) {
    if (isHttpError(e)) {
      return jsonError(req, e.status, e.code, e.message, e.details);
    }
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
