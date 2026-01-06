import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenantContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenantContext(req);

    const forms = await prisma.form.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true, name: true, description: true, status: true },
      orderBy: { updatedAt: "desc" },
    });

    return jsonOk(req, { forms });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error("[mobile.v1.forms] GET unexpected error", e);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
