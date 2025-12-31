/**
 * LeadRadar2026A – Tenant Context (x-tenant-slug)
 * - tenant-owned access must always be tenantId-scoped
 * - leak-safe: unknown tenant => 404 NOT_FOUND
 */

import type { Tenant } from "@prisma/client";
import { prisma } from "./prisma";
import { httpError } from "./http";

export function getTenantSlug(req: Request): string | null {
  const raw = req.headers.get("x-tenant-slug");
  const slug = raw?.trim();
  if (!slug) return null;
  return slug.toLowerCase();
}

export async function resolveTenantBySlug(slug: string): Promise<Tenant | null> {
  return prisma.tenant.findUnique({ where: { slug } });
}

export async function requireTenantContext(req: Request): Promise<Tenant> {
  const slug = getTenantSlug(req);

  if (!slug) {
    throw httpError(401, "TENANT_REQUIRED", "Tenant context required (x-tenant-slug header).", {
      header: "x-tenant-slug",
    });
  }

  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) {
    // leak-safe: do NOT reveal whether tenant exists in any other way
    throw httpError(404, "NOT_FOUND", "Not found.");
  }

  return tenant;
}
