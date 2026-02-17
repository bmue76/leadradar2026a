import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/api";
import { validateBody, isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";

import { EventUpdateBodySchema, updateEvent, deleteEventIfAllowed } from "../_repo";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctxRoute: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAdminAuth(req);
    const { id } = await ctxRoute.params;
    const body = await validateBody(req, EventUpdateBodySchema);

    const item = await updateEvent(prisma, ctx.tenantId, id, body);
    if (!item) return jsonError(req, 404, "NOT_FOUND", "Event not found.");

    return jsonOk(req, { item });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return jsonError(req, 500, "DB_ERROR", "Database error.", { code: e.code });
    }

    console.error("PATCH /api/admin/v1/events/:id failed", e);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function DELETE(req: NextRequest, ctxRoute: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAdminAuth(req);
    const { id } = await ctxRoute.params;

    const res = await deleteEventIfAllowed(prisma, ctx.tenantId, id);

    if (res.status === "NOT_FOUND") return jsonError(req, 404, "NOT_FOUND", "Event not found.");

    if (res.status === "NOT_DELETABLE") {
      return jsonError(req, 409, res.code, res.message, res.details);
    }

    return jsonOk(req, { deleted: true, id: res.id });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return jsonError(req, 500, "DB_ERROR", "Database error.", { code: e.code });
    }

    console.error("DELETE /api/admin/v1/events/:id failed", e);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
