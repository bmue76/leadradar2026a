import { jsonOk } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return jsonOk(req, {
    scope: "platform",
    status: "ok",
    now: new Date().toISOString(),
    env: {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      vercel: Boolean(process.env.VERCEL),
    },
  });
}
