import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, httpError } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const IdSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i);

type TemplateSource = "SYSTEM" | "TENANT";

function toSource(tenantId: string | null, isPublic: boolean): TemplateSource {
  if (!tenantId && isPublic) return "SYSTEM";
  return "TENANT";
}

const FieldSnapSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    type: z.string().min(1),
    required: z.boolean().optional(),
  })
  .passthrough();

function extractFields(cfg: unknown): Array<z.infer<typeof FieldSnapSchema>> {
  if (!cfg || typeof cfg !== "object") return [];
  const o = cfg as Record<string, unknown>;
  const direct = o.fields;
  const snap = o.fieldsSnapshot;

  const arr = Array.isArray(direct) ? direct : Array.isArray(snap) ? snap : [];
  const out: Array<z.infer<typeof FieldSnapSchema>> = [];
  for (const item of arr) {
    const res = FieldSnapSchema.safeParse(item);
    if (res.success) out.push(res.data);
  }
  return out;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const id = IdSchema.parse((await ctx.params).id);

    const row = await prisma.formPreset.findFirst({
      where: {
        id,
        OR: [{ tenantId }, { tenantId: null, isPublic: true }],
      },
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

    if (!row) throw httpError(404, "NOT_FOUND", "Not found.");

    const fields = extractFields(row.config as unknown).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: Boolean(f.required),
    }));

    const item = {
      id: row.id,
      name: row.name,
      category: (row.category ?? "").trim() ? row.category : null,
      description: row.description ?? null,
      source: toSource(row.tenantId, Boolean(row.isPublic)),
      fieldCount: fields.length,
      updatedAt: row.updatedAt,
      fields,
    };

    return jsonOk(req, { item });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
