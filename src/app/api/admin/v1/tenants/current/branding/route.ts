import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody, httpError } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const HEX6 = /^#[0-9a-fA-F]{6}$/;

const PatchBrandingSchema = z
  .object({
    accentColor: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() : v),
      z.union([z.string().regex(HEX6, "accentColor must be in format #RRGGBB"), z.null()]).optional()
    ),
  })
  .strict();

export async function PATCH(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const body = await validateBody(req, PatchBrandingSchema);

    // No-op allowed (keeps endpoint flexible)
    const data: { accentColor?: string | null } = {};
    if (Object.prototype.hasOwnProperty.call(body, "accentColor")) {
      data.accentColor = body.accentColor ?? null;
    }

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data,
      select: { id: true, slug: true, name: true, accentColor: true, updatedAt: true },
    });

    return jsonOk(req, { tenant: updated });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    // Prisma: record not found -> leak-safe 404
    if (e instanceof Error && e.message.toLowerCase().includes("record to update not found")) {
      return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
