import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateQuery } from "@/lib/http";
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

function cleanCategory(v: unknown): string | undefined {
  const t = cleanText(v);
  if (!t) return undefined;
  if (t === "ALL") return undefined;
  return t;
}

type TemplateSource = "SYSTEM" | "TENANT";

const ListTemplatesQuerySchema = z
  .object({
    q: z.preprocess((v) => cleanText(v), z.string().min(1).max(200).optional()),
    category: z.preprocess((v) => cleanCategory(v), z.string().min(1).max(200).optional()),
    source: z.preprocess((v) => cleanEnum(v), z.enum(["ALL", "SYSTEM", "TENANT"]).default("ALL")),
    sort: z.preprocess((v) => cleanEnum(v), z.enum(["updatedAt", "name"]).default("updatedAt")),
    dir: z.preprocess((v) => cleanEnum(v), z.enum(["asc", "desc"]).default("desc")),
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

function countFields(cfg: unknown): number {
  if (!cfg || typeof cfg !== "object") return 0;
  const o = cfg as Record<string, unknown>;
  if (Array.isArray(o.fields)) return o.fields.length;
  if (Array.isArray(o.fieldsSnapshot)) return o.fieldsSnapshot.length;
  return 0;
}

function toSource(tenantId: string | null, isPublic: boolean): TemplateSource {
  if (!tenantId && isPublic) return "SYSTEM";
  return "TENANT";
}

export async function GET(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const q = await validateQuery(req, ListTemplatesQuerySchema);

    let where: Prisma.FormPresetWhereInput;

    if (q.source === "SYSTEM") {
      where = { tenantId: null, isPublic: true };
    } else if (q.source === "TENANT") {
      where = { tenantId };
    } else {
      where = {
        OR: [{ tenantId }, { tenantId: null, isPublic: true }],
      };
    }

    if (q.q) where.name = { contains: q.q, mode: "insensitive" };
    if (q.category) where.category = { equals: q.category, mode: "insensitive" };

    const orderBy =
      q.sort === "name"
        ? [{ name: q.dir }, { updatedAt: "desc" as const }]
        : [{ updatedAt: q.dir }, { createdAt: "desc" as const }];

    const rows = await prisma.formPreset.findMany({
      where,
      orderBy,
      take: q.take,
      select: {
        id: true,
        tenantId: true,
        isPublic: true,
        name: true,
        category: true,
        description: true,
        updatedAt: true,
        config: true,
      },
    });

    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: (r.category ?? "").trim() ? r.category : null,
      description: r.description ?? null,
      source: toSource(r.tenantId, Boolean(r.isPublic)),
      fieldCount: countFields(r.config as unknown),
      updatedAt: r.updatedAt,
    }));

    return jsonOk(req, { items });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
