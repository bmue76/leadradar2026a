import { jsonError, jsonOk } from "@/lib/api";
import { httpError, isHttpError, validateBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { listFormAssignmentEventIds, replaceFormAssignmentEventIds } from "./_repo";

export const runtime = "nodejs";

function getHeader(req: Request, name: string): string {
  return (req.headers.get(name) || "").trim();
}

function requireAdminUserId(req: Request): string {
  const userId = getHeader(req, "x-admin-user-id") || getHeader(req, "x-user-id");
  if (!userId) throw httpError(401, "UNAUTHENTICATED", "Authentication required.");
  return userId;
}

async function requireTenantId(req: Request): Promise<string> {
  const tenantId = getHeader(req, "x-tenant-id");
  if (tenantId) return tenantId;

  const tenantSlug = getHeader(req, "x-tenant-slug");
  if (!tenantSlug) {
    throw httpError(401, "TENANT_CONTEXT_REQUIRED", "Tenant context required (x-tenant-id header).");
  }

  const t = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!t) throw httpError(404, "NOT_FOUND", "Not found.");
  return t.id;
}

// Next.js 15+: ctx.params can be a Promise. Compatible with older versions too.
type CtxParams = { id?: string } | Promise<{ id?: string }>;
async function readFormId(ctx: { params: CtxParams }): Promise<string> {
  const p = (await Promise.resolve(ctx.params)) as { id?: string };
  return String(p?.id || "").trim();
}

const PutBodySchema = z.object({
  eventIds: z.array(z.string().min(1)).max(500),
});

function pickPrismaMeta(e: unknown): { prismaCode?: string; errorName?: string } {
  const any = e as { name?: unknown; code?: unknown };
  const errorName = typeof any?.name === "string" ? any.name : undefined;
  const prismaCode = typeof any?.code === "string" ? any.code : undefined;
  const looksPrisma = (errorName || "").toLowerCase().includes("prisma") || !!prismaCode;
  return looksPrisma ? { prismaCode, errorName } : { errorName };
}

export async function GET(req: Request, ctx: { params: CtxParams }) {
  try {
    requireAdminUserId(req);

    const tenantId = await requireTenantId(req);
    const formId = await readFormId(ctx);
    if (!formId) throw httpError(404, "NOT_FOUND", "Not found.");

    const eventIds = await listFormAssignmentEventIds(tenantId, formId);
    return jsonOk(req, { eventIds });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);

    const meta = pickPrismaMeta(e);
    console.error("admin forms assignments GET failed", meta, e);

    if (process.env.NODE_ENV !== "production") {
      return jsonError(req, 500, "INTERNAL", "Unexpected error.", meta);
    }
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}

export async function PUT(req: Request, ctx: { params: CtxParams }) {
  try {
    requireAdminUserId(req);

    const tenantId = await requireTenantId(req);
    const formId = await readFormId(ctx);
    if (!formId) throw httpError(404, "NOT_FOUND", "Not found.");

    const body = await validateBody(req, PutBodySchema);
    const saved = await replaceFormAssignmentEventIds(tenantId, formId, body.eventIds);

    return jsonOk(req, { eventIds: saved });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);

    const meta = pickPrismaMeta(e);
    console.error("admin forms assignments PUT failed", meta, e);

    if (process.env.NODE_ENV !== "production") {
      return jsonError(req, 500, "INTERNAL", "Unexpected error.", meta);
    }
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
