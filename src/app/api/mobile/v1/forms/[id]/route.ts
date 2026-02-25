import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateQuery } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { enforceMobileCaptureLicense } from "@/lib/billing/mobileCaptureGate";

export const runtime = "nodejs";

const QuerySchema = z
  .object({
    eventId: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() : ""),
      z.string().min(1).max(64)
    ),
  })
  .strict();

// Next.js 15+: params can be a Promise
type CtxParams = { id?: string } | Promise<{ id?: string }>;
async function readId(ctx: { params: CtxParams }): Promise<string> {
  const p = (await Promise.resolve(ctx.params)) as { id?: string };
  return String(p?.id || "").trim();
}

export async function GET(req: Request, ctx: { params: CtxParams }) {
  try {
    const auth = await requireMobileAuth(req);

    enforceRateLimit(`mobile:${auth.apiKeyId}`, { limit: 60, windowMs: 60_000 });

    await enforceMobileCaptureLicense(auth.tenantId);

    const query = await validateQuery(req, QuerySchema);
    const eventId = query.eventId;

    const formId = await readId(ctx);
    if (!formId) throw httpError(404, "NOT_FOUND", "Not found.");

    // Validate event (tenant-scoped) must be ACTIVE
    const ev = await prisma.event.findFirst({
      where: { id: eventId, tenantId: auth.tenantId },
      select: { id: true, status: true },
    });
    if (!ev) throw httpError(404, "NOT_FOUND", "Not found.");
    if (ev.status !== "ACTIVE") throw httpError(409, "EVENT_NOT_ACTIVE", "Event not active.");

    // Visibility rule (same as list):
    // assigned to event OR global
    const form = await prisma.form.findFirst({
      where: {
        id: formId,
        tenantId: auth.tenantId,
        status: "ACTIVE",
        OR: [
          { eventAssignments: { some: { tenantId: auth.tenantId, eventId } } },
          { eventAssignments: { none: {} } },
        ],
      },
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
            sortOrder: true,
            placeholder: true,
            helpText: true,
            config: true,
          },
        },
      },
    });

    if (!form) throw httpError(404, "NOT_FOUND", "Not found.");

    return jsonOk(req, form);
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
