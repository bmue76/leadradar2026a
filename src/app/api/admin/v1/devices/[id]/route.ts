import { Prisma } from "@prisma/client";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody, httpError } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const PatchSchema = z.object({
  name: z.string().max(120).nullable().optional(),
  setActiveEventId: z.string().min(1).nullable().optional(),
});

type PatchBody = z.infer<typeof PatchSchema>;

export async function GET(req: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAdminAuth(req);
    const { id } = await ctxRoute.params;

    const device = await prisma.mobileDevice.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
        activeEventId: true,
        activeEvent: { select: { id: true, name: true, status: true } },
        apiKey: { select: { id: true, prefix: true, status: true, revokedAt: true, lastUsedAt: true } },
      },
    });

    if (!device) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    return jsonOk(req, {
      item: {
        id: device.id,
        name: device.name,
        status: device.status,
        lastSeenAt: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
        createdAt: device.createdAt.toISOString(),
        activeEvent: device.activeEvent
          ? { id: device.activeEvent.id, name: device.activeEvent.name, status: device.activeEvent.status }
          : null,
        apiKey: {
          id: device.apiKey.id,
          prefix: device.apiKey.prefix,
          status: device.apiKey.status,
          revokedAt: device.apiKey.revokedAt ? device.apiKey.revokedAt.toISOString() : null,
          lastUsedAt: device.apiKey.lastUsedAt ? device.apiKey.lastUsedAt.toISOString() : null,
        },
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return jsonError(req, 500, "DB_ERROR", "Database error.", { code: e.code });
    }

    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function PATCH(req: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAdminAuth(req);
    const { id } = await ctxRoute.params;

    const body = (await validateBody(req, PatchSchema, 32 * 1024)) as PatchBody;

    const exists = await prisma.mobileDevice.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!exists) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    let nextName: string | undefined;
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const raw = body.name; // string | null | undefined
      if (raw === null || raw === undefined) {
        nextName = "Gerät";
      } else {
        const t = raw.trim();
        nextName = t ? t : "Gerät";
      }
    }

    let nextActiveEventId: string | null | undefined;
    if (Object.prototype.hasOwnProperty.call(body, "setActiveEventId")) {
      const raw = body.setActiveEventId; // string | null | undefined
      if (raw === null || raw === undefined) {
        nextActiveEventId = null;
      } else {
        const ev = await prisma.event.findFirst({
          where: { id: raw, tenantId: ctx.tenantId },
          select: { id: true },
        });
        if (!ev) throw httpError(404, "NOT_FOUND", "Not found.");
        nextActiveEventId = ev.id;
      }
    }

    const updated = await prisma.mobileDevice.update({
      where: { id },
      data: {
        ...(nextName !== undefined ? { name: nextName } : {}),
        ...(nextActiveEventId !== undefined ? { activeEventId: nextActiveEventId } : {}),
      },
      select: { id: true },
    });

    return jsonOk(req, { id: updated.id });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return jsonError(req, 500, "DB_ERROR", "Database error.", { code: e.code });
    }

    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function DELETE(req: Request, ctxRoute: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAdminAuth(req);
    const { id } = await ctxRoute.params;

    const device = await prisma.mobileDevice.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        apiKeyId: true,
        apiKey: { select: { status: true } },
      },
    });

    if (!device) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const revokedApiKey = device.apiKey.status === "ACTIVE";

    await prisma.$transaction(async (tx) => {
      if (revokedApiKey) {
        await tx.mobileApiKey.update({
          where: { id: device.apiKeyId },
          data: { status: "REVOKED", revokedAt: new Date() },
        });
      }

      await tx.mobileDevice.delete({ where: { id: device.id } });
    });

    return jsonOk(req, { deleted: true, id: device.id, revokedApiKey });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return jsonError(req, 500, "DB_ERROR", "Database error.", { code: e.code });
    }

    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
