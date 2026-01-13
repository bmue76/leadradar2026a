import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { isHttpError } from "@/lib/http";

/**
 * Standardized Route wrapper (no ad-hoc try/catch per route):
 * - HttpError -> jsonError with status/code/details
 * - unknown -> 500 INTERNAL
 */
export async function handleRoute(req: NextRequest, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e: unknown) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error("Unhandled API error:", e);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
