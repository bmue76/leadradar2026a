import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonOk } from "@/lib/api";
import { handleRoute } from "@/lib/route";
import { validateQuery } from "@/lib/http";
import { requireTenantContext } from "@/lib/tenantContext";
import { listEventsForStatistics } from "../_repo";

const QuerySchema = z.object({}).passthrough();

export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const { tenantId } = await requireTenantContext(req);
    await validateQuery(req, QuerySchema);

    const events = await listEventsForStatistics(tenantId);

    return jsonOk(req, { events, generatedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  });
}
