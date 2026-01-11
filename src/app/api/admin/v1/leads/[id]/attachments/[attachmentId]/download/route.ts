export const runtime = "nodejs";

import { jsonError, getTraceId } from "@/lib/api";
import { isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireTenantContext, getTenantSlug } from "@/lib/tenant";
import { requireAdminAuth } from "@/lib/auth";
import { fileExists, getAbsolutePath, streamFileWeb } from "@/lib/storage";

function contentDisposition(opts: { filename: string; inline: boolean }): string {
  const fallback = (opts.filename || "attachment").replace(/[\r\n"]/g, "_");
  const mode = opts.inline ? "inline" : "attachment";
  // Basic + safe. (UTF-8 filename* could be added later if needed.)
  return `${mode}; filename="${fallback}"`;
}

export async function GET(
  req: Request,
  ctx: { params: { id: string; attachmentId: string } }
) {
  const traceId = getTraceId(req);

  try {
    const leadId = String(ctx?.params?.id ?? "").trim();
    const attachmentId = String(ctx?.params?.attachmentId ?? "").trim();
    if (!leadId || !attachmentId) {
      return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    // Resolve tenantId:
    // - If x-tenant-slug present (curl proof), use it
    // - Else use cookie-based admin auth (required for <img> and <a>)
    let tenantId: string;

    const slug = getTenantSlug(req);
    if (slug) {
      const tenant = await requireTenantContext(req);
      tenantId = tenant.id;
    } else {
      const auth = await requireAdminAuth(req);
      tenantId = auth.tenantId;
    }

    // leak-safe lead check
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: { id: true },
    });
    if (!lead) {
      return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    const att = await prisma.leadAttachment.findFirst({
      where: { id: attachmentId, tenantId, leadId },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        storageKey: true,
      },
    });

    if (!att || !att.storageKey) {
      return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    const absPath = getAbsolutePath({ rootDirName: ".tmp_attachments", relativeKey: att.storageKey });
    const exists = await fileExists(absPath);
    if (!exists) {
      return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    const url = new URL(req.url);
    const wantsInline = url.searchParams.get("inline") === "1";
    const canInline = wantsInline && String(att.mimeType || "").startsWith("image/");

    return new Response(streamFileWeb(absPath), {
      status: 200,
      headers: {
        "x-trace-id": traceId,
        "content-type": att.mimeType || "application/octet-stream",
        "content-disposition": contentDisposition({ filename: att.filename || "attachment", inline: canInline }),
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details, { headers: { "x-trace-id": traceId } });
    return jsonError(req, 500, "INTERNAL", "Unexpected error.", undefined, { headers: { "x-trace-id": traceId } });
  }
}
