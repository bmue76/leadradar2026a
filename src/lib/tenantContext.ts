import { httpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth";

export type TenantContext = {
  tenantId: string;
  tenantSlug: string;
};

function cleanHeader(req: Request, name: string): string {
  return (req.headers.get(name) ?? "").trim();
}

/**
 * Tenant context resolution (Admin).
 *
 * Priority:
 *  1) x-tenant-id (strongest)
 *  2) x-tenant-slug
 *  3) Session user.tenantId (fallback)
 *
 * Leak-safe:
 *  - If session tenant exists AND header tenant exists AND mismatch => 404 NOT_FOUND (no details)
 *  - Unknown tenant => 404 NOT_FOUND
 */
export async function requireTenantContext(req: Request): Promise<TenantContext> {
  const headerTenantId = cleanHeader(req, "x-tenant-id");
  const headerTenantSlug = cleanHeader(req, "x-tenant-slug");

  const current = await getCurrentUserFromRequest(req);
  const sessionTenantId = current?.user?.tenantId ?? null;

  // If both session + header exist: mismatch => leak-safe 404
  if (sessionTenantId && headerTenantId && headerTenantId !== sessionTenantId) {
    throw httpError(404, "NOT_FOUND", "Not found.");
  }

  if (sessionTenantId && headerTenantSlug) {
    const t = await prisma.tenant.findUnique({ where: { slug: headerTenantSlug }, select: { id: true } });
    if (!t || t.id !== sessionTenantId) {
      throw httpError(404, "NOT_FOUND", "Not found.");
    }
  }

  // Resolve effective tenant
  if (headerTenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: headerTenantId },
      select: { id: true, slug: true },
    });
    if (!tenant) throw httpError(404, "NOT_FOUND", "Not found.");
    return { tenantId: tenant.id, tenantSlug: tenant.slug };
  }

  if (headerTenantSlug) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: headerTenantSlug },
      select: { id: true, slug: true },
    });
    if (!tenant) throw httpError(404, "NOT_FOUND", "Not found.");
    return { tenantId: tenant.id, tenantSlug: tenant.slug };
  }

  if (sessionTenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: sessionTenantId },
      select: { id: true, slug: true },
    });
    if (!tenant) throw httpError(404, "NOT_FOUND", "Not found.");
    return { tenantId: tenant.id, tenantSlug: tenant.slug };
  }

  // No header + no session => not authenticated / no tenant context
  throw httpError(401, "TENANT_REQUIRED", "Tenant context required.");
}
