import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/api";
import { validateBody, validateQuery, isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";

import { EventCreateBodySchema, EventListQuerySchema, createEvent, listEvents } from "./_repo";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminAuth(req);
    const q = await validateQuery(req, EventListQuerySchema);
    const items = await listEvents(prisma, ctx.tenantId, q);
    return jsonOk(req, { items });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return jsonError(req, 500, "DB_ERROR", "Database error.", { code: e.code });
    }

    console.error("GET /api/admin/v1/events failed", e);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdminAuth(req);
    const body = await validateBody(req, EventCreateBodySchema);
    const item = await createEvent(prisma, ctx.tenantId, body);
    return jsonOk(req, { item }, { status: 201 });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return jsonError(req, 500, "DB_ERROR", "Database error.", { code: e.code });
    }

    console.error("POST /api/admin/v1/events failed", e);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
