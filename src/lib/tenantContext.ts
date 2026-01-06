import { httpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth";

export type TenantContext = {
  tenantId: string;
  tenantSlug: string;
};

function cleanHeader(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;
  if (s.toLowerCase() === "null") return null;
  return s;
}

function readTenantIdHeader(req: Request): string | null {
  return cleanHeader(req.headers.get("x-tenant-id"));
}

function readTenantSlugHeader(req: Request): string | null {
  return cleanHeader(req.headers.get("x-tenant-slug"));
}

async function readSessionTenantId(req: Request): Promise<string | null> {
  // Only attempt session fallback if a cookie is present
  const cookie = req.headers.get("cookie");
  if (!cookie || !cookie.trim()) return null;

  const current = await getCurrentUserFromRequest(req);
  const tid = current?.user?.tenantId ?? null;
  return typeof tid === "string" && tid.trim() ? tid : null;
}

/**
 * Admin tenant context resolver (MVP, hardened).
 *
 * Priority:
 * 1) x-tenant-id (strongest signal)
 * 2) x-tenant-slug
 * 3) Session user tenantId (cookie-backed)
 *
 * Leak-safe:
 * - unknown tenant => 404 NOT_FOUND
 * - mismatch between header and session => 404 NOT_FOUND (no details)
 * - mismatch between x-tenant-id and x-tenant-slug => 404 NOT_FOUND (no details)
 */
export async function requireTenantContext(req: Request): Promise<TenantContext> {
  const headerTenantId = readTenantIdHeader(req);
  const headerTenantSlug = readTenantSlugHeader(req);

  // Session fallback is only relevant if a cookie exists
  const sessionTenantId = await readSessionTenantId(req);

  let tenantById: { id: string; slug: string } | null = null;
  let tenantBySlug: { id: string; slug: string } | null = null;

  if (headerTenantId) {
    tenantById = await prisma.tenant.findUnique({
      where: { id: headerTenantId },
      select: { id: true, slug: true },
    });
    if (!tenantById) throw httpError(404, "NOT_FOUND", "Not found.");
  }

  if (headerTenantSlug) {
    tenantBySlug = await prisma.tenant.findUnique({
      where: { slug: headerTenantSlug },
      select: { id: true, slug: true },
    });
    if (!tenantBySlug) throw httpError(404, "NOT_FOUND", "Not found.");
  }

  // If both headers are present, they must resolve to the same tenant.
  if (tenantById && tenantBySlug && tenantById.id !== tenantBySlug.id) {
    throw httpError(404, "NOT_FOUND", "Not found.");
  }

  // Determine effective tenant
  let effective: { id: string; slug: string } | null = null;
  if (tenantById) effective = tenantById;
  else if (tenantBySlug) effective = tenantBySlug;

  // If no headers provided, fall back to session tenantId.
  if (!effective) {
    if (!sessionTenantId) {
      throw httpError(401, "TENANT_REQUIRED", "Tenant context required.");
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: sessionTenantId },
      select: { id: true, slug: true },
    });

    if (!tenant) throw httpError(404, "NOT_FOUND", "Not found.");
    effective = tenant;
  }

  // Leak-safe mismatch: if session exists and differs from effective => 404
  if (sessionTenantId && effective.id !== sessionTenantId) {
    throw httpError(404, "NOT_FOUND", "Not found.");
  }

  return { tenantId: effective.id, tenantSlug: effective.slug };
}
