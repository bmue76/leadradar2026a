import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext } from "@/lib/tenantContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantContext(req);
    const { id } = await context.params;

    const form = await prisma.form.findFirst({
      where: { id, tenantId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        fields: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            key: true,
            label: true,
            type: true,
            required: true,
            isActive: true,
            sortOrder: true,
            placeholder: true,
            helpText: true,
            config: true,
          },
        },
      },
    });

    if (!form) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    return jsonOk(req, form);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error("[mobile.v1.forms.id] GET unexpected error", e);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
