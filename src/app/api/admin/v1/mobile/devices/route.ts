import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenantContext";
import { z } from "zod";

export const runtime = "nodejs";

const CreateDeviceBody = z.object({
  name: z.string().trim().min(1).max(120),
  apiKeyId: z.string().trim().min(1),
});

function toDeviceRow(d: {
  id: string;
  name: string;
  status: "ACTIVE" | "DISABLED";
  lastSeenAt: Date | null;
  createdAt: Date;
  apiKey: { id: string; prefix: string; status: "ACTIVE" | "REVOKED"; lastUsedAt: Date | null };
  _count: { assignments: number };
}) {
  return {
    id: d.id,
    name: d.name,
    status: d.status,
    lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
    apiKeyPrefix: d.apiKey.prefix,
    apiKeyStatus: d.apiKey.status,
    lastUsedAt: d.apiKey.lastUsedAt ? d.apiKey.lastUsedAt.toISOString() : null,
    assignedFormsCount: d._count.assignments,
  };
}

export async function GET(req: Request) {
  try {
    const { tenantId } = await requireTenantContext(req);

    const devices = await prisma.mobileDevice.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
        apiKey: { select: { id: true, prefix: true, status: true, lastUsedAt: true } },
        _count: { select: { assignments: true } },
      },
    });

    return jsonOk(req, { items: devices.map(toDeviceRow) });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId } = await requireTenantContext(req);
    const body = await validateBody(req, CreateDeviceBody);

    const key = await prisma.mobileApiKey.findFirst({
      where: { id: body.apiKeyId, tenantId },
      select: { id: true },
    });
    if (!key) throw httpError(404, "NOT_FOUND", "Not found.");

    const created = await prisma.mobileDevice.create({
      data: {
        tenantId,
        name: body.name,
        apiKeyId: body.apiKeyId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
        apiKey: { select: { id: true, prefix: true, status: true, lastUsedAt: true } },
        _count: { select: { assignments: true } },
      },
    });

    return jsonOk(req, { device: toDeviceRow(created) });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
