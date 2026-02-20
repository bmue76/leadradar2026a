import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function newTraceId(): string {
  return crypto.randomUUID();
}

function jsonOk(data: unknown, traceId: string) {
  const res = NextResponse.json({ ok: true, data, traceId }, { status: 200 });
  res.headers.set("x-trace-id", traceId);
  return res;
}

function jsonError(status: number, code: string, message: string, traceId: string) {
  const res = NextResponse.json(
    { ok: false, error: { code, message, details: { traceId } }, traceId },
    { status }
  );
  res.headers.set("x-trace-id", traceId);
  return res;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const traceId = newTraceId();
  const { id } = await ctx.params;

  const leadId = (id ?? "").trim();
  if (!leadId) return jsonError(400, "BAD_REQUEST", "Missing id param.", traceId);

  const userId = (req.headers.get("x-user-id") || req.headers.get("x-admin-user-id") || "").trim();
  if (!userId) return jsonError(401, "UNAUTHORIZED", "Missing x-user-id.", traceId);

  const tenantId = (req.headers.get("x-tenant-id") || "").trim();
  if (!tenantId) return jsonError(401, "UNAUTHORIZED", "Missing x-tenant-id.", traceId);

  // IMPORTANT: dynamic import => no Prisma module evaluation during build collection
  const { getPrisma } = await import("@/server/db/prisma");
  const prisma = getPrisma();

  // Leak-safe: tenant scoped updateMany (if 0 -> 404)
  const result = await prisma.lead.updateMany({
    where: { id: leadId, tenantId, isDeleted: false },
    data: { isDeleted: true },
  });

  if (result.count === 0) {
    return jsonError(404, "NOT_FOUND", "Not found.", traceId);
  }

  return jsonOk({ id: leadId }, traceId);
}
