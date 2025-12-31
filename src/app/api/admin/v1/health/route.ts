import { jsonOk } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return jsonOk(req, {
    scope: "admin",
    status: "ok",
    now: new Date().toISOString(),
  });
}
