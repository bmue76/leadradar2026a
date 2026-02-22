import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };

function traceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function jsonOk<T>(data: T, tid: string): Response {
  const body: ApiOk<T> = { ok: true, data, traceId: tid };
  return NextResponse.json(body, { status: 200, headers: { "x-trace-id": tid } });
}

function jsonError(code: string, message: string, tid: string, status = 400, details?: unknown): Response {
  const body: ApiErr = { ok: false, error: { code, message, details }, traceId: tid };
  return NextResponse.json(body, { status, headers: { "x-trace-id": tid } });
}

function requireTenant(req: NextRequest, tid: string): { ok: true; tenantId: string } | { ok: false; res: Response } {
  const tenantId = req.headers.get("x-tenant-id") || "";
  if (!tenantId) return { ok: false, res: jsonError("TENANT_CONTEXT_REQUIRED", "Missing x-tenant-id.", tid, 401) };
  return { ok: true, tenantId };
}

const PatchBody = z.object({
  name: z.string().min(2).max(80),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const tid = traceId();
  const tenant = requireTenant(req, tid);
  if (!tenant.ok) return tenant.res;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("BAD_JSON", "Invalid JSON body.", tid, 400);
  }

  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", parsed.error.message, tid, 400);

  const device = await prisma.mobileDevice.findFirst({
    where: { id, tenantId: tenant.tenantId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!device) return jsonError("NOT_FOUND", "Device not found.", tid, 404);

  const updated = await prisma.mobileDevice.update({
    where: { id },
    data: { name: parsed.data.name.trim() },
    select: { id: true, name: true },
  });

  return jsonOk(updated, tid);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const tid = traceId();
  const tenant = requireTenant(req, tid);
  if (!tenant.ok) return tenant.res;

  const { id } = await ctx.params;

  const device = await prisma.mobileDevice.findFirst({
    where: { id, tenantId: tenant.tenantId, status: "ACTIVE" },
    select: { id: true, apiKeyId: true, apiKey: { select: { status: true } } },
  });
  if (!device) return jsonError("NOT_FOUND", "Device not found.", tid, 404);

  const revokedApiKey = device.apiKey.status === "ACTIVE";

  await prisma.$transaction(async (tx) => {
    if (revokedApiKey) {
      await tx.mobileApiKey.update({
        where: { id: device.apiKeyId },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
    }

    // soft delete: keep device row for license history
    await tx.mobileDevice.update({
      where: { id: device.id },
      data: { status: "DISABLED" },
    });
  });

  return jsonOk({ deleted: true, id: device.id, revokedApiKey }, tid);
}
