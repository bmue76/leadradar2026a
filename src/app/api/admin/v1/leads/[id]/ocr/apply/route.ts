import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk as _jsonOk } from "@/lib/api";
import { isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant";

export const runtime = "nodejs";

type AdminCtx = { tenantId: string; userId: string | null };

function jsonOkCompat(req: Request, data: unknown, status = 200): Response {
  const fn = _jsonOk as unknown as (...args: unknown[]) => Response;
  if (typeof fn === "function" && fn.length >= 3) return fn(req, status, data);
  return fn(req, data);
}

async function resolveAdminCtx(req: Request): Promise<AdminCtx> {
  try {
    const auth = (await requireAdminAuth(req)) as { tenantId: string; userId?: string | null };
    return { tenantId: auth.tenantId, userId: auth.userId ?? null };
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      const t = await requireTenantContext(req);
      return { tenantId: t.id, userId: null };
    }
    throw e;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function normStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function anyNonEmpty(obj: Record<string, unknown>): boolean {
  for (const v of Object.values(obj)) {
    if (typeof v === "string" && v.trim().length) return true;
  }
  return false;
}

const ApplyBodySchema = z
  .object({
    ocrResultId: z.string().min(1).max(128),
  })
  .strict();

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await resolveAdminCtx(req);
    const { id: leadId } = await context.params;

    // Leak-safe: ensure lead is tenant-scoped.
    const lead = await prisma.lead.findFirst({
      where: { tenantId, id: leadId },
      select: { id: true },
    });
    if (!lead) return jsonError(req, 404, "NOT_FOUND", "Lead not found.");

    const body = await validateBody(req, ApplyBodySchema);

    const ocr = await prisma.leadOcrResult.findFirst({
      where: { tenantId, id: body.ocrResultId, leadId },
      select: {
        id: true,
        status: true,
        parsedContactJson: true,
        correctedContactJson: true,
      },
    });
    if (!ocr) return jsonError(req, 404, "NOT_FOUND", "OCR result not found.");

    const effective = (ocr.correctedContactJson ?? ocr.parsedContactJson) as unknown;

    if (!isPlainObject(effective) || !anyNonEmpty(effective)) {
      return jsonError(req, 400, "BAD_REQUEST", "No parsed/corrected OCR contact to apply.");
    }

    const c = effective;

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        contactFirstName: normStr(c.firstName),
        contactLastName: normStr(c.lastName),
        contactEmail: normStr(c.email),
        contactPhone: normStr(c.phone),
        contactMobile: normStr(c.mobile),
        contactCompany: normStr(c.company),
        contactTitle: normStr(c.title),
        contactWebsite: normStr(c.website),
        contactStreet: normStr(c.street),
        contactZip: normStr(c.zip),
        contactCity: normStr(c.city),
        contactCountry: normStr(c.country),

        contactSource: "OCR_ADMIN",
        contactUpdatedAt: new Date(),
        contactOcrResultId: ocr.id,
      },
    });

    return jsonOkCompat(req, { leadId, appliedOcrResultId: ocr.id });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL", "Unexpected server error.");
  }
}
