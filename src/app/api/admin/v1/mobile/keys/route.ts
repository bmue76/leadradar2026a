import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody } from "@/lib/http";
import { requireTenantContext } from "@/lib/tenantContext";
import { prisma } from "@/lib/prisma";
import { adminCreateMobileApiKey } from "@/lib/mobileAuth";

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  deviceName: z.string().min(1).max(80).optional(),
});

export async function POST(req: Request) {
  try {
    const t = await requireTenantContext(req);
    const body = await validateBody(req, CreateSchema);

    const created = await adminCreateMobileApiKey({
      tenantId: t.tenantId,
      name: body.name,
      deviceName: body.deviceName,
    });

    return jsonOk(req, {
      id: created.id,
      prefix: created.prefix,
      apiKey: created.apiKey, // cleartext only once
      createdAt: created.createdAt,
      deviceId: created.deviceId ?? null,
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function GET(req: Request) {
  try {
    const t = await requireTenantContext(req);

    const keys = await prisma.mobileApiKey.findMany({
      where: { tenantId: t.tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        status: true,
        createdAt: true,
        revokedAt: true,
        lastUsedAt: true,
      },
      take: 200,
    });

    return jsonOk(req, keys);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
