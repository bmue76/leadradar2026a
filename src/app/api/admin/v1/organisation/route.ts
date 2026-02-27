import { jsonError, jsonOk } from "@/lib/api";
import { RepoError, getAdminHeaderScopeFromRequest, getOrganisationSummaryByScope } from "./_repo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const scope = getAdminHeaderScopeFromRequest(req);
    const data = await getOrganisationSummaryByScope(scope);
    return jsonOk(req, data);
  } catch (e: unknown) {
    if (e instanceof RepoError) {
      return jsonError(req, e.status, e.code, e.message, e.details);
    }
    return jsonError(req, 500, "INTERNAL_ERROR", "Unerwarteter Fehler.");
  }
}
