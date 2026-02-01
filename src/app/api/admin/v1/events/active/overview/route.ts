import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";

import { getActiveOverview } from "../../_repo";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminAuth(req);
    const data = await getActiveOverview(prisma, ctx.tenantId);
    return jsonOk(req, data);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return jsonError(req, 500, "DB_ERROR", "Database error.", { code: e.code });
    }

    console.error("GET /api/admin/v1/events/active/overview failed", e);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
