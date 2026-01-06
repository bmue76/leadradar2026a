import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const auth = await requireMobileAuth(req);

    enforceRateLimit(`mobile:${auth.apiKeyId}`, { limit: 60, windowMs: 60_000 });

    // leak-safe: only return form if assigned to this device (and ACTIVE).
    const assignment = await prisma.mobileDeviceForm.findFirst({
      where: {
        tenantId: auth.tenantId,
        deviceId: auth.deviceId,
        formId: id,
        form: { status: "ACTIVE" },
      },
      select: {
        form: {
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            fields: {
              where: { isActive: true },
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                key: true,
                label: true,
                type: true,
                required: true,
                sortOrder: true,
                placeholder: true,
                helpText: true,
                config: true,
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    return jsonOk(req, assignment.form);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
