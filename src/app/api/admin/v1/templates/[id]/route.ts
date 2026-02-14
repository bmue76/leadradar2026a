import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const IdSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i);
function countFields(cfg: unknown): number {
  if (!cfg || typeof cfg !== "object") return 0;
  const o = cfg as Record<string, unknown>;
  if (Array.isArray(o.fields)) return o.fields.length;
  if (Array.isArray(o.fieldsSnapshot)) return o.fieldsSnapshot.length;
  return 0;
}

type TemplateSource = "SYSTEM" | "TENANT";
function toSource(tenantId: string | null, isPublic: boolean): TemplateSource {
  if (!tenantId && isPublic) return "SYSTEM";
  return "TENANT";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const { id } = await ctx.params;
    const templateId = IdSchema.parse(id);

    const row = await prisma.formPreset.findFirst({
      where: {
        id: templateId,
        OR: [{ tenantId }, { tenantId: null, isPublic: true }],
      },
      select: {
        id: true,
        tenantId: true,
        isPublic: true,
        name: true,
        category: true,
        description: true,
        imageUrl: true,
        updatedAt: true,
        config: true,
      },
    });

    if (!row) throw httpError(404, "NOT_FOUND", "Not found.");

    return jsonOk(req, {
      id: row.id,
      name: row.name,
      category: (row.category ?? "").trim() ? row.category : null,
      description: row.description ?? null,
      imageUrl: row.imageUrl ?? null,
      source: toSource(row.tenantId, Boolean(row.isPublic)),
      fieldCount: countFields(row.config as unknown),
      updatedAt: row.updatedAt,
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const { id } = await ctx.params;
    const templateId = IdSchema.parse(id);

    // Leak-safe: only delete tenant-owned, non-public presets
    const res = await prisma.formPreset.deleteMany({
      where: { id: templateId, tenantId, isPublic: false },
    });

    if (res.count <= 0) {
      // if it's a system template, return a clear forbidden (no deletion)
      const isSystem = await prisma.formPreset.findFirst({
        where: { id: templateId, tenantId: null, isPublic: true },
        select: { id: true },
      });
      if (isSystem) throw httpError(403, "FORBIDDEN", "System-Vorlagen können nicht gelöscht werden.");
      throw httpError(404, "NOT_FOUND", "Not found.");
    }

    return jsonOk(req, { deleted: true });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
