import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_HOURS = 12;

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
  | { ok: true; tenantId: string; tenantSlug: string; userId?: string }
  | { ok: false; res: Response } {
  const tenantId = req.headers.get("x-tenant-id") || "";
  const tenantSlug = req.headers.get("x-tenant-slug") || "";
  const userId = req.headers.get("x-user-id") || undefined;

  if (!tenantId) return { ok: false, res: jsonError("TENANT_CONTEXT_REQUIRED", "Missing x-tenant-id.", tid, 401) };
  if (!tenantSlug) return { ok: false, res: jsonError("TENANT_CONTEXT_REQUIRED", "Missing x-tenant-slug.", tid, 401) };
  return { ok: true, tenantId, tenantSlug, userId };
}

function nowPlusHours(h: number): Date {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

function genCode(len = 10): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function qrPayload(tenantSlug: string, code: string): string {
  return `leadradar://provision?tenant=${encodeURIComponent(tenantSlug)}&code=${encodeURIComponent(code)}`;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const tid = traceId();
  const tenant = requireTenant(req, tid);
  if (!tenant.ok) return tenant.res;

  const { id: deviceId } = await ctx.params;

  const device = await prisma.mobileDevice.findFirst({
    where: { id: deviceId, tenantId: tenant.tenantId },
    select: { id: true, name: true },
  });
  if (!device) return jsonError("NOT_FOUND", "Device not found.", tid, 404);

  // revoke old
  await prisma.mobileProvisionToken.updateMany({
    where: { tenantId: tenant.tenantId, deviceId, status: "ACTIVE" },
    data: { status: "REVOKED", tokenPlaintext: null },
  });

  const code = genCode(10);
  const expiresAt = nowPlusHours(TTL_HOURS);

  await prisma.mobileProvisionToken.create({
    data: {
      tenantId: tenant.tenantId,
      deviceId,
      prefix: code.slice(0, 4),
      tokenHash: sha256Hex(code),
      tokenPlaintext: code,
      status: "ACTIVE",
      expiresAt,
      createdByUserId: tenant.userId ?? null,
      requestedDeviceName: device.name,
    },
    select: { id: true },
  });

  return jsonOk(
    {
      token: code,
      expiresAt: expiresAt.toISOString(),
      qrPayload: qrPayload(tenant.tenantSlug, code),
      tenantSlug: tenant.tenantSlug,
      deviceId,
    },
    tid
  );
}
