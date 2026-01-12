import { z } from "zod";
import { jsonError, getTraceId } from "@/lib/api";
import { isHttpError, validateQuery } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant";
import { fileExists, getAbsolutePath, streamFileWeb } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  disposition: z.enum(["attachment", "inline"]).optional(),
});

function safeDownloadName(filename: string, fallback: string): string {
  const raw = String(filename ?? "").trim();
  if (!raw) return fallback;
  const base = raw.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, 200);
}

async function resolveTenantIdForAdmin(req: Request): Promise<string> {
  // Prefer session auth (prod)
  try {
    const auth = await requireAdminAuth(req);
    return auth.tenantId;
  } catch (e) {
    // DEV fallback (allows curl proof via x-tenant-slug)
    if (process.env.NODE_ENV !== "production") {
      const t = await requireTenantContext(req);
      return t.id;
    }
    throw e;
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string; attachmentId: string }> }) {
  const traceId = getTraceId(req);

  try {
    const { id: leadId, attachmentId } = await ctx.params;
    const q = await validateQuery(req, QuerySchema);
    const disposition = q.disposition ?? "attachment";

    const tenantId = await resolveTenantIdForAdmin(req);

    // leak-safe: lead must belong to tenant
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: { id: true },
    });
    if (!lead) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    // leak-safe: attachment must belong to tenant + lead
    const att = await prisma.leadAttachment.findFirst({
      where: { id: attachmentId, tenantId, leadId: lead.id },
      select: { id: true, filename: true, mimeType: true, storageKey: true },
    });
    if (!att) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    if (!att.storageKey) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const absPath = getAbsolutePath({ rootDirName: ".tmp_attachments", relativeKey: att.storageKey });
    const exists = await fileExists(absPath);
    if (!exists) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const name = safeDownloadName(att.filename, `attachment-${att.id}`);
    const headers = new Headers();
    headers.set("x-trace-id", traceId);
    headers.set("cache-control", "private, no-store");
    headers.set("content-type", att.mimeType || "application/octet-stream");
    headers.set("content-disposition", `${disposition}; filename="${name}"`);

    return new Response(streamFileWeb(absPath), { status: 200, headers });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
