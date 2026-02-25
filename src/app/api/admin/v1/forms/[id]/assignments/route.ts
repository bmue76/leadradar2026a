import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

// Next.js 15+: params can be a Promise
type CtxParams = { id?: string } | Promise<{ id?: string }>;
async function readId(ctx: { params: CtxParams }): Promise<string> {
  const p = (await Promise.resolve(ctx.params)) as { id?: string };
  return String(p?.id || "").trim();
}

const IdSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i);

const PutBodySchema = z
  .object({
    eventIds: z.array(IdSchema).max(200),
  })
  .strict();

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

export async function GET(req: Request, ctx: { params: CtxParams }) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const formId = await readId(ctx);
    if (!formId) throw httpError(404, "NOT_FOUND", "Not found.");

    // leak-safe: ensure form belongs to tenant
    const exists = await prisma.form.findFirst({ where: { id: formId, tenantId }, select: { id: true } });
    if (!exists) throw httpError(404, "NOT_FOUND", "Not found.");

    const rows = await prisma.eventFormAssignment.findMany({
      where: { tenantId, formId },
      select: { eventId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 1000,
    });

    const eventIds = rows.map((r) => r.eventId);
    return jsonOk(req, { eventIds });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function PUT(req: Request, ctx: { params: CtxParams }) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const formId = await readId(ctx);
    if (!formId) throw httpError(404, "NOT_FOUND", "Not found.");

    const body = await validateBody(req, PutBodySchema);

    // leak-safe: ensure form belongs to tenant
    const exists = await prisma.form.findFirst({ where: { id: formId, tenantId }, select: { id: true } });
    if (!exists) throw httpError(404, "NOT_FOUND", "Not found.");

    const cleaned = uniq(body.eventIds.map((x) => x.trim()).filter(Boolean));

    // leak-safe validate that all eventIds (if any) belong to tenant
    if (cleaned.length > 0) {
      const found = await prisma.event.findMany({
        where: { tenantId, id: { in: cleaned } },
        select: { id: true },
        take: 500,
      });

      if (found.length !== cleaned.length) throw httpError(404, "NOT_FOUND", "Not found.");
    }

    // Mirror legacy assignedEventId (best-effort backward compat):
    // - 0 => null (global)
    // - 1 => that eventId
    // - >1 => null (cannot represent multi in legacy column)
    const legacyAssignedEventId = cleaned.length === 1 ? cleaned[0] : null;

    await prisma.$transaction([
      prisma.eventFormAssignment.deleteMany({ where: { tenantId, formId } }),
      ...(cleaned.length > 0
        ? [
            prisma.eventFormAssignment.createMany({
              data: cleaned.map((eventId) => ({ tenantId, formId, eventId })),
              skipDuplicates: true,
            }),
          ]
        : []),
      prisma.form.update({
        where: { id: formId },
        data: { assignedEventId: legacyAssignedEventId },
        select: { id: true },
      }),
    ]);

    return jsonOk(req, { eventIds: cleaned });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
