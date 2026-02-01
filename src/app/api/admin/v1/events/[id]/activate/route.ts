import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";

import { activateEvent } from "../../_repo";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctxRoute: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAdminAuth(req);
    const { id } = await ctxRoute.params;

    const res = await activateEvent(prisma, ctx.tenantId, id);
    if (res === "NOT_FOUND") return jsonError(req, 404, "NOT_FOUND", "Event not found.");
    if (res === "ARCHIVED") return jsonError(req, 409, "EVENT_ARCHIVED", "Archived events cannot be activated.");

    return jsonOk(req, { ok: true });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return jsonError(req, 409, "KEY_CONFLICT", "Only one ACTIVE event is allowed per tenant.");
      }
      return jsonError(req, 500, "DB_ERROR", "Database error.", { code: e.code });
    }

    console.error("POST /api/admin/v1/events/:id/activate failed", e);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
