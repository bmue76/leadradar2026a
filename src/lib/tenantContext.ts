import { httpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";

export type TenantContext = {
  tenantId: string;
  tenantSlug: string;
};

function readHeader(req: Request, name: string): string {
  return (req.headers.get(name) ?? "").trim();
}

async function resolveTenantIdFromSlugOrId(input: string): Promise<string | null> {
  const v = input.trim();
  if (!v) return null;

  // Try slug
  const bySlug = await prisma.tenant.findUnique({
    where: { slug: v },
    select: { id: true },
  });
  if (bySlug) return bySlug.id;

  // Fallback: some dev flows might pass an id in x-tenant-slug
  const byId = await prisma.tenant.findUnique({
    where: { id: v },
    select: { id: true },
  });
  if (byId) return byId.id;

  return null;
}

/**
 * Admin tenant context resolver (MVP, hardened).
 *
 * Source of truth:
 * - Session tenantId from requireAdminAuth(req)
 *
 * Optional header claims:
 * - x-tenant-id (strongest claim)
 * - x-tenant-slug (resolved to tenantId)
 *
 * Leak-safe mismatch handling:
 * - If header claim exists but does not match session tenantId => 404 NOT_FOUND (no details)
 * - If header claim exists but cannot be resolved => 404 NOT_FOUND
 */
export async function requireTenantContext(req: Request): Promise<TenantContext> {
  const auth = await requireAdminAuth(req);
  const sessionTenantId = auth.tenantId;

  const headerTenantId = readHeader(req, "x-tenant-id");
  const headerTenantSlug = readHeader(req, "x-tenant-slug");

  let claimTenantId: string | null = null;

  if (headerTenantId) {
    claimTenantId = headerTenantId;
  } else if (headerTenantSlug) {
    claimTenantId = await resolveTenantIdFromSlugOrId(headerTenantSlug);
    if (!claimTenantId) {
      // header claim provided but unknown => leak-safe 404
      throw httpError(404, "NOT_FOUND", "Not found.");
    }
  }

  if (claimTenantId && claimTenantId !== sessionTenantId) {
    // leak-safe mismatch => 404
    throw httpError(404, "NOT_FOUND", "Not found.");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: sessionTenantId },
    select: { id: true, slug: true },
  });

  if (!tenant) throw httpError(404, "NOT_FOUND", "Not found.");

  return { tenantId: tenant.id, tenantSlug: tenant.slug };
}
