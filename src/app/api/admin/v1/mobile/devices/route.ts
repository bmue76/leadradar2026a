import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody, httpError } from "@/lib/http";
import { requireTenantContext } from "@/lib/tenantContext";
import { prisma } from "@/lib/prisma";

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  apiKeyId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const t = await requireTenantContext(req);
    const body = await validateBody(req, CreateSchema);

    // Ensure key exists in this tenant and is ACTIVE
    const key = await prisma.mobileApiKey.findFirst({
      where: { id: body.apiKeyId, tenantId: t.tenantId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!key) throw httpError(404, "NOT_FOUND", "API key not found.");

    // Enforce 1:1 key -> device via unique apiKeyId on MobileDevice
    const existingDevice = await prisma.mobileDevice.findFirst({
      where: { tenantId: t.tenantId, apiKeyId: body.apiKeyId },
      select: { id: true },
    });
    if (existingDevice) throw httpError(409, "KEY_CONFLICT", "API key is already bound to a device.");

    const device = await prisma.mobileDevice.create({
      data: {
        tenantId: t.tenantId,
        name: body.name,
        apiKeyId: body.apiKeyId,
        status: "ACTIVE",
      },
      select: { id: true, name: true, apiKeyId: true, status: true },
    });

    return jsonOk(req, device);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function GET(req: Request) {
  try {
    const t = await requireTenantContext(req);

    const devices = await prisma.mobileDevice.findMany({
      where: { tenantId: t.tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        apiKeyId: true,
        apiKey: { select: { prefix: true } },
        assignments: {
          select: {
            form: { select: { id: true, name: true, status: true } },
          },
          orderBy: { assignedAt: "desc" },
          take: 200,
        },
      },
      take: 200,
    });

    const shaped = devices.map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      lastSeenAt: d.lastSeenAt,
      apiKeyId: d.apiKeyId,
      apiKeyPrefix: d.apiKey.prefix,
      assignedForms: d.assignments.map((a) => a.form),
    }));

    return jsonOk(req, shaped);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
