import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/http";

/**
 * Admin Tenant Context
 * - Requires x-tenant-slug
 * - Missing header => 401 TENANT_REQUIRED
 * - Unknown slug => 404 NOT_FOUND (leak-safe)
 */
export async function requireTenantContext(req: Request): Promise<{ id: string; slug: string; name: string }> {
  const slug = req.headers.get("x-tenant-slug")?.trim();
  if (!slug) {
    throw httpError(401, "TENANT_REQUIRED", "Tenant context required (x-tenant-slug).");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });

  // leak-safe: unknown tenant => 404
  if (!tenant) {
    throw httpError(404, "NOT_FOUND", "Not found.");
  }

  return tenant;
}
