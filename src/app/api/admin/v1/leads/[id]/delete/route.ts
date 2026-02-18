import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data, traceId: crypto.randomUUID() }, { status });
}

function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(details ? { details } : {}) }, traceId: crypto.randomUUID() },
    { status }
  );
}

const BodySchema = z
  .object({
    reason: z.string().trim().min(1).max(200).optional(),
  })
  .optional();

async function handle(req: NextRequest, ctx: { params: { id: string } }) {
  const userId = req.headers.get("x-user-id") || req.headers.get("x-admin-user-id");
  const tenantId = req.headers.get("x-tenant-id");
  if (!userId) return jsonError(401, "UNAUTHORIZED", "Missing x-user-id.");
  if (!tenantId) return jsonError(401, "UNAUTHORIZED", "Missing x-tenant-id.");

  const leadId = ctx.params.id;
  if (!leadId) return jsonError(400, "BAD_REQUEST", "Missing lead id.");

  // Optional body (reason)
  let reason: string | undefined;
  const raw: unknown = await req.json().catch(() => undefined);
  if (raw !== undefined) {
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(400, "BAD_REQUEST", "Invalid JSON body.", parsed.error.flatten());
    }
    reason = parsed.data?.reason;
  }

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, tenantId },
    select: { id: true, isDeleted: true },
  });

  if (!lead) return jsonError(404, "NOT_FOUND", "Lead not found.");

  if (lead.isDeleted) {
    return jsonOk({ id: lead.id, deleted: true, alreadyDeleted: true });
  }

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedReason: reason ?? "ADMIN_DELETE",
    },
  });

  return jsonOk({ id: lead.id, deleted: true });
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  return handle(req, ctx);
}

// Bonus: erlaubt auch DELETE (falls du später REST-cleaner werden willst)
export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  return handle(req, ctx);
}
