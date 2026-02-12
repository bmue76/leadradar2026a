import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, httpError, validateBody } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const PatchPresetSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),

    // NOTE: DB currently requires category. If provided, it must be non-empty.
    category: z.string().trim().min(1).max(200).optional(),

    // Allow clearing by sending "" -> becomes null
    description: z.string().trim().max(2000).optional(),

    // MVP: URL-only. Clearing not supported via empty string (would fail url()).
    imageUrl: z.string().trim().max(2000).url().optional(),
  })
  .strict();

function nullableText(s?: string): string | null | undefined {
  if (typeof s === "undefined") return undefined;
  const t = s.trim();
  return t ? t : null;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const { id } = await ctx.params;

    const body = await validateBody(req, PatchPresetSchema);

    // Leak-safe: only tenant-owned presets are editable
    const existing = await prisma.formPreset.findFirst({
      where: { id, tenantId, isPublic: false },
      select: { id: true },
    });

    if (!existing) {
      throw httpError(404, "NOT_FOUND", "Not found.");
    }

    const updated = await prisma.formPreset.update({
      where: { id: existing.id },
      data: {
        name: typeof body.name === "undefined" ? undefined : body.name.trim(),
        category: typeof body.category === "undefined" ? undefined : body.category.trim(),
        description: nullableText(body.description),
        imageUrl: typeof body.imageUrl === "undefined" ? undefined : body.imageUrl.trim(),
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

    return jsonOk(req, updated);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const { id } = await ctx.params;

    // Leak-safe delete: deleteMany with tenantId scope, then check count
    const res = await prisma.formPreset.deleteMany({
      where: { id, tenantId, isPublic: false },
    });

    if (res.count <= 0) {
      throw httpError(404, "NOT_FOUND", "Not found.");
    }

    return jsonOk(req, { deleted: true });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
