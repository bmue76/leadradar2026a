import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function traceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function jsonOk(data: unknown, tid: string): Response {
  return NextResponse.json({ ok: true, data, traceId: tid }, { status: 200, headers: { "x-trace-id": tid } });
}

function jsonError(code: string, message: string, tid: string, status = 400): Response {
  return NextResponse.json({ ok: false, error: { code, message }, traceId: tid }, { status, headers: { "x-trace-id": tid } });
}

function requireTenant(req: NextRequest, tid: string):
  | { ok: true; tenantId: string }
  | { ok: false; res: Response } {
  const tenantId = req.headers.get("x-tenant-id") || "";
  if (!tenantId) return { ok: false, res: jsonError("TENANT_CONTEXT_REQUIRED", "Missing x-tenant-id.", tid, 401) };
  return { ok: true, tenantId };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const tid = traceId();
  const tenant = requireTenant(req, tid);
  if (!tenant.ok) return tenant.res;

  const { id: deviceId } = await ctx.params;

  const device = await prisma.mobileDevice.findFirst({
    where: { id: deviceId, tenantId: tenant.tenantId },
    select: { id: true },
  });
  if (!device) return jsonError("NOT_FOUND", "Device not found.", tid, 404);

  const now = new Date();
  const lic = await prisma.deviceLicense.findFirst({
    where: {
      tenantId: tenant.tenantId,
      deviceId,
      status: "ACTIVE",
      endsAt: { gt: now },
    },
    orderBy: { endsAt: "desc" },
    select: { endsAt: true, type: true },
  });

  return jsonOk(
    {
      isActive: Boolean(lic),
      endsAt: lic ? lic.endsAt.toISOString() : null,
      type: lic ? lic.type : null,
    },
    tid
  );
}
