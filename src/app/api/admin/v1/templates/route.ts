import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateQuery } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

import type { TemplateSummary } from "@/lib/templates/shared";
import { readTemplateMeta } from "@/lib/templates/shared";

export const runtime = "nodejs";

const QuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.preprocess((v) => {
    if (typeof v !== "string") return undefined;
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : undefined;
  }, z.number().int().min(1).max(200).optional()),
});

function matchesQuery(t: TemplateSummary, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [t.name, t.description ?? "", t.category ?? ""].join(" ").toLowerCase();
  return hay.includes(needle);
}

export async function GET(req: Request) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const query = await validateQuery(req, QuerySchema);

    const limit = query.limit ?? 50;

    const forms = await prisma.form.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: {
        id: true,
        name: true,
        description: true,
        config: true,
        updatedAt: true,
      },
    });

    const templates: TemplateSummary[] = forms
      .map((f) => {
        const meta = readTemplateMeta(f.config);
        if (!meta.isTemplate) return null;

        return {
          id: f.id,
          name: f.name,
          description: f.description ?? null,
          category: meta.category,
          imageKey: meta.imageKey,
          updatedAt: f.updatedAt.toISOString(),
        };
      })
      .filter((x): x is TemplateSummary => x !== null)
      .filter((t) => (query.q ? matchesQuery(t, query.q) : true))
      .slice(0, limit);

    return jsonOk(req, templates);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
