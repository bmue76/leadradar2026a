import { z } from "zod";
import { Prisma, FormStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody, validateQuery } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const ListFormsQuerySchema = z.object({
  status: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.nativeEnum(FormStatus).optional()
  ),
  q: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : undefined),
    z.string().min(1).max(200).optional()
  ),
});

const CreateFormSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  status: z.nativeEnum(FormStatus).optional(),
  config: z.unknown().optional(),
});

function prismaMetaTarget(e: Prisma.PrismaClientKnownRequestError): unknown {
  const meta = e.meta;
  if (meta && typeof meta === "object" && "target" in meta) {
    return (meta as { target?: unknown }).target;
  }
  return undefined;
}

function mapPrismaUniqueConflict(
  e: unknown
): { status: number; code: string; message: string; details?: unknown } | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      return {
        status: 409,
        code: "UNIQUE_CONFLICT",
        message: "Unique constraint violation.",
        details: { target: prismaMetaTarget(e) },
      };
    }
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const query = await validateQuery(req, ListFormsQuerySchema);

    const where: Prisma.FormWhereInput = { tenantId };
    if (query.status) where.status = query.status;
    if (query.q) where.name = { contains: query.q, mode: "insensitive" };

    const rows = await prisma.form.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { fields: true } },
      },
    });

    const forms = rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      fieldsCount: r._count.fields,
    }));

    return jsonOk(req, { forms });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    const conflict = mapPrismaUniqueConflict(e);
    if (conflict) return jsonError(req, conflict.status, conflict.code, conflict.message, conflict.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const body = await validateBody(req, CreateFormSchema);

    const created = await prisma.form.create({
      data: {
        tenantId,
        name: body.name,
        description: body.description,
        status: body.status ?? FormStatus.DRAFT,
        config: (body.config ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        description: true,
        status: true,
        config: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return jsonOk(req, created, { status: 201 });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    const conflict = mapPrismaUniqueConflict(e);
    if (conflict) return jsonError(req, conflict.status, conflict.code, conflict.message, conflict.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
