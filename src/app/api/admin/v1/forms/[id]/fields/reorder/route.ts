import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

export const runtime = "nodejs";

const IdSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+$/i);

function isPromiseLike<T>(v: unknown): v is Promise<T> {
  return typeof v === "object" && v !== null && "then" in v && typeof (v as { then?: unknown }).then === "function";
}

async function getParams<T extends Record<string, string>>(ctx: unknown): Promise<T> {
  const params = (ctx as { params?: unknown })?.params;
  if (isPromiseLike<T>(params)) return await params;
  return params as T;
}

const BodySchema = z
  .object({
    orderedIds: z.array(z.string().trim().min(1)).optional(),
    order: z.array(z.string().trim().min(1)).optional(),
  })
  .refine((d) => Array.isArray(d.orderedIds) || Array.isArray(d.order), {
    message: "Body must include orderedIds or order (array).",
  });

function uniqPreserve(xs: string[]) {
  return Array.from(new Set(xs));
}

async function handle(req: Request, ctx: unknown) {
  try {
    const { tenantId } = await requireAdminAuth(req);
    const { id } = await getParams<{ id: string }>(ctx);

    const formId = String(id || "").trim();
    if (!IdSchema.safeParse(formId).success) throw httpError(404, "NOT_FOUND", "Not found.");

    const body = await validateBody(req, BodySchema);

    const raw = (body.orderedIds ?? body.order ?? []) as string[];
    const orderedIds = uniqPreserve(raw.map((s) => String(s).trim()).filter(Boolean));
    if (orderedIds.length === 0) throw httpError(400, "INVALID_BODY", "Invalid request body.", { order: ["Must not be empty."] });

    const form = await prisma.form.findFirst({
      where: { id: formId, tenantId },
      select: { id: true },
    });
    if (!form) throw httpError(404, "NOT_FOUND", "Not found.");

    const fields = await prisma.formField.findMany({
      where: { formId, tenantId },
      select: { id: true },
    });

    const existingIds = fields.map((f) => f.id);
    const existingSet = new Set(existingIds);

    // Must be full permutation (TP2.8 contract)
    if (orderedIds.length !== existingIds.length) {
      throw httpError(400, "INVALID_BODY", "Invalid request body.", {
        order: ["order must include ALL fields of this form."],
      });
    }
    if (orderedIds.some((fid) => !existingSet.has(fid))) {
      throw httpError(400, "INVALID_BODY", "Invalid request body.", {
        order: ["order contains unknown field ids."],
      });
    }

    await prisma.$transaction(
      orderedIds.map((fid, idx) =>
        prisma.formField.updateMany({
          where: { id: fid, formId, tenantId },
          data: { sortOrder: (idx + 1) * 10 },
        })
      )
    );

    return jsonOk(req, { formId, updated: orderedIds.length, orderedIds });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}

export async function POST(req: Request, ctx: unknown) {
  return handle(req, ctx);
}

export async function PUT(req: Request, ctx: unknown) {
  return handle(req, ctx);
}
