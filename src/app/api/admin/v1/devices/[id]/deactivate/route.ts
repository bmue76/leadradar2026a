import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { requireAdminAuth } from "@/lib/auth";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { $Enums } from "@prisma/client";

export const runtime = "nodejs";

async function getOrCreateEntitlement(tenantId: string) {
  return prisma.tenantEntitlement.upsert({
    where: { tenantId },
    create: { tenantId, maxDevices: 1 },
    update: {},
    select: { maxDevices: true },
  });
}

async function getActiveDevicesCount(tenantId: string): Promise<number> {
  const activeDevices = await prisma.mobileDevice.findMany({
    where: { tenantId, status: $Enums.MobileDeviceStatus.ACTIVE },
    select: { apiKeyId: true },
  });

  const keyIds = Array.from(new Set(activeDevices.map((d) => d.apiKeyId).filter(Boolean)));
  if (keyIds.length === 0) return 0;

  const activeKeys = await prisma.mobileApiKey.findMany({
    where: { tenantId, status: "ACTIVE", id: { in: keyIds } },
    select: { id: true },
  });

  const activeKeyIds = activeKeys.map((k) => k.id);
  if (activeKeyIds.length === 0) return 0;

  return prisma.mobileDevice.count({
    where: { tenantId, status: $Enums.MobileDeviceStatus.ACTIVE, apiKeyId: { in: activeKeyIds } },
  });
}

const DEVICE_DEACTIVATED_STATUS: $Enums.MobileDeviceStatus = (() => {
  const values = Object.values($Enums.MobileDeviceStatus) as $Enums.MobileDeviceStatus[];
  return values.find((v) => v !== $Enums.MobileDeviceStatus.ACTIVE) ?? $Enums.MobileDeviceStatus.ACTIVE;
})();

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const auth = await requireAdminAuth(req);
    const tenantId = auth.tenantId;

    const { id } = await context.params;

    const existing = await prisma.mobileDevice.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, apiKeyId: true },
    });

    // leak-safe
    if (!existing) return jsonError(req, 404, "NOT_FOUND", "Device not found.");

    if (existing.status !== $Enums.MobileDeviceStatus.ACTIVE) {
      return jsonError(req, 409, "INVALID_STATE", "Device is not ACTIVE.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.mobileDevice.update({
        where: { id },
        data: { status: DEVICE_DEACTIVATED_STATUS },
      });

      await tx.mobileApiKey.updateMany({
        where: { id: existing.apiKeyId, tenantId, status: "ACTIVE" },
        data: { status: "REVOKED" },
      });
    });

    const entitlement = await getOrCreateEntitlement(tenantId);
    const activeDevices = await getActiveDevicesCount(tenantId);

    return jsonOk(req, {
      summary: { activeDevices, maxDevices: entitlement.maxDevices },
      id,
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
