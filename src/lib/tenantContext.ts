import { httpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export type TenantContext = {
  tenantId: string;
  tenantSlug: string;
};

function resolveTenantSlug(req: Request): string | null {
  const fromHeader = req.headers.get("x-tenant-slug");
  if (fromHeader && fromHeader.trim()) return fromHeader.trim();

  // Dev fallback (useful for browser navigation & downloads)
  if (process.env.NODE_ENV !== "production") {
    const dev = process.env.DEV_TENANT_SLUG;
    if (dev && dev.trim()) return dev.trim();
  }

  return null;
}

/**
 * Admin tenant context resolver (MVP).
 * - Prefers x-tenant-slug header
 * - Dev fallback via DEV_TENANT_SLUG (local only)
 * - Leak-safe: unknown slug => 404 NOT_FOUND
 */
export async function requireTenantContext(req: Request): Promise<TenantContext> {
  const slug = resolveTenantSlug(req);
  if (!slug) throw httpError(401, "TENANT_REQUIRED", "Tenant context required (x-tenant-slug).");

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  });

  if (!tenant) throw httpError(404, "NOT_FOUND", "Not found.");

  return { tenantId: tenant.id, tenantSlug: tenant.slug };
}
