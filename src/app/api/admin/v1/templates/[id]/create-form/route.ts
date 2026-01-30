import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";

import { createFormFromTemplate, getTemplateDetailForTenant } from "../../_repo";

export const runtime = "nodejs";

const BodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  openBuilder: z.boolean().optional().default(false),
});

function isErrorWithMessage(e: unknown): e is { message: string } {
  return typeof e === "object" && e !== null && "message" in e && typeof (e as { message: unknown }).message === "string";
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminAuth(req);
    const { id } = await ctx.params;

    const body = await validateBody(req, BodySchema);

    const tpl = await getTemplateDetailForTenant({ tenantId: auth.tenantId, id });
    if (!tpl) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const name = body.name ?? tpl.name;

    const created = await createFormFromTemplate({
      tenantId: auth.tenantId,
      templateId: id,
      name,
    });

    if (!created) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    return jsonOk(req, {
      formId: created.formId,
      redirect: body.openBuilder ? `/admin/forms/${created.formId}/builder` : `/admin/forms?open=${created.formId}`,
    });
  } catch (e) {
    if (isErrorWithMessage(e) && e.message === "NOT_FOUND") {
      return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }
    if (isHttpError(e)) {
      return jsonError(req, e.status, e.code, e.message, e.details);
    }
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
