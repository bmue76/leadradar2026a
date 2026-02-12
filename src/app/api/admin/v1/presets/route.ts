import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody, validateQuery } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

function firstString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return undefined;
}

function cleanText(v: unknown): string | undefined {
  const s = firstString(v);
  const t = (s ?? "").trim();
  return t ? t : undefined;
}

function cleanEnum(v: unknown): string | undefined {
  return cleanText(v);
}

const ListPresetsQuerySchema = z
  .object({
    q: z.preprocess((v) => cleanText(v), z.string().min(1).max(200).optional()),
    category: z.preprocess((v) => cleanText(v), z.string().min(1).max(200).optional()),

    // MVP: default tenant-only. Future: allow includePublic=true.
    scope: z.preprocess((v) => cleanEnum(v), z.enum(["TENANT", "ALL"]).default("TENANT")),

    take: z.preprocess(
      (v) => {
        const s = firstString(v);
        const n = Number(s);
        if (!Number.isFinite(n)) return undefined;
        return n;
      },
      z.number().int().min(1).max(100).default(50)
    ),
  })
  .strict();

const CreatePresetSchema = z
  .object({
    name: z.string().trim().min(1).max(200),

    // NOTE: DB currently requires category (Prisma Client types). MVP default if omitted.
    category: z.string().trim().min(1).max(200).optional(),

    description: z.string().trim().max(2000).optional(),

    imageUrl: z.string().trim().max(2000).url().optional(),

    // Snapshot payload (Builder config, includes fields)
    config: z.unknown(),
  })
  .strict();

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

function normalizeCategory(v?: string): string {
  const t = (v ?? "").trim();
  return t ? t : "Standard";
}

export async function GET(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const query = await validateQuery(req, ListPresetsQuerySchema);

    const where: Prisma.FormPresetWhereInput =
      query.scope === "ALL"
        ? {
            OR: [
              { tenantId }, // tenant-owned
              { tenantId: null, isPublic: true }, // global/public (future)
            ],
          }
        : { tenantId }; // tenant-only

    if (query.q) where.name = { contains: query.q, mode: "insensitive" };
    if (query.category) where.category = { equals: query.category, mode: "insensitive" };

    const rows = await prisma.formPreset.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: query.take,
      select: {
        id: true,
        tenantId: true,
        name: true,
        category: true,
        description: true,
        imageUrl: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const items = rows.map((r) => ({
      id: r.id,
      scope: r.isPublic && !r.tenantId ? ("PUBLIC" as const) : ("TENANT" as const),
      name: r.name,
      // Keep API semantics: empty string treated as null for UI.
      category: (r.category ?? "").trim() ? r.category : null,
      description: r.description ?? null,
      imageUrl: r.imageUrl ?? null,
      isPublic: Boolean(r.isPublic),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return jsonOk(req, { items });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}

export async function POST(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const body = await validateBody(req, CreatePresetSchema);

    // MVP: tenant-owned only. Public presets later (tenantId=null + isPublic=true).
    const created = await prisma.formPreset.create({
      data: {
        tenantId,
        name: body.name,
        category: normalizeCategory(body.category),
        description: body.description ?? null,
        imageUrl: body.imageUrl ?? null,
        isPublic: false,
        config: body.config as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        category: true,
        description: true,
        imageUrl: true,
        isPublic: true,
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
