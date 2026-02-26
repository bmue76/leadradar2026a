import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonOk, jsonError } from "@/lib/api";
import { handleRoute } from "@/lib/route";
import { validateQuery } from "@/lib/http";
import { requireTenantContext } from "@/lib/tenantContext";
import { getAdminStatistics } from "./_repo";

const QuerySchema = z.object({
  eventId: z.string().min(1),
  from: z.string().datetime(),
  to: z.string().datetime(),
  compare: z.enum(["none", "previous"]).optional().default("previous"),
  includeDeleted: z.enum(["0", "1"]).optional().default("0"),
});

export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const { tenantId } = await requireTenantContext(req);

    const q = await validateQuery(req, QuerySchema);
    const from = new Date(q.from);
    const to = new Date(q.to);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      return jsonError(req, 400, "BAD_REQUEST", "Invalid from/to range.");
    }

    const data = await getAdminStatistics({
      tenantId,
      eventId: q.eventId,
      from,
      to,
      compare: q.compare,
      includeDeleted: q.includeDeleted === "1",
    });

    if (data.notFound) {
      return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    return jsonOk(req, data, { headers: { "cache-control": "no-store" } });
  });
}
