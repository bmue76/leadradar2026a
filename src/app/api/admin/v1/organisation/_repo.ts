import { prisma } from "@/lib/prisma";

export type OrganisationSummary = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    createdAt: string; // ISO
  };
  owner: {
    id: string;
    name: string | null;
    email: string;
  };
  activeLicensesCount: number;
};

export class RepoError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type AdminHeaderScope = { tenantId: string; userId: string };

export function getAdminHeaderScopeFromRequest(req: Request): AdminHeaderScope {
  const tenantId = req.headers.get("x-tenant-id")?.trim() ?? "";
  const userId = req.headers.get("x-user-id")?.trim() ?? "";
  if (!tenantId || !userId) {
    throw new RepoError(401, "UNAUTHENTICATED", "Nicht angemeldet oder Tenant-Kontext fehlt.");
  }
  return { tenantId, userId };
}

type CountableModel = { count: (args: { where: unknown }) => Promise<number> };
type PrismaLike = Record<string, unknown>;

function getCountableModel(p: PrismaLike, modelKey: string): CountableModel | null {
  const model = p[modelKey];
  if (!model || typeof model !== "object") return null;
  const maybeCount = (model as { count?: unknown }).count;
  if (typeof maybeCount !== "function") return null;
  return model as CountableModel;
}

async function tryCount(p: PrismaLike, modelKey: string, where: unknown): Promise<number | null> {
  const model = getCountableModel(p, modelKey);
  if (!model) return null;
  return await model.count({ where });
}

/**
 * Best-effort Aggregation ohne Schema-Coupling:
 * - bevorzugt: licenseKey (status=ACTIVE)
 * - fallback: deviceLicense (status=ACTIVE)
 * - fallback: deviceActivation (isActive=true)
 * - sonst: 0
 */
async function countActiveLicenses(tenantId: string): Promise<number> {
  const p = prisma as unknown as PrismaLike;

  const a =
    (await tryCount(p, "licenseKey", { tenantId, status: "ACTIVE" })) ??
    (await tryCount(p, "deviceLicense", { tenantId, status: "ACTIVE" })) ??
    (await tryCount(p, "deviceActivation", { tenantId, isActive: true })) ??
    0;

  return typeof a === "number" ? a : 0;
}

export async function getOrganisationSummaryByScope(scope: AdminHeaderScope): Promise<OrganisationSummary> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: scope.tenantId },
    select: { id: true, name: true, slug: true, createdAt: true },
  });

  // leak-safe: falscher tenant → 404
  if (!tenant) {
    throw new RepoError(404, "NOT_FOUND", "Nicht gefunden.");
  }

  const owner = await prisma.user.findFirst({
    where: { id: scope.userId, tenantId: scope.tenantId },
    select: { id: true, name: true, email: true },
  });

  // leak-safe: falscher user/tenant → 404
  if (!owner) {
    throw new RepoError(404, "NOT_FOUND", "Nicht gefunden.");
  }

  const activeLicensesCount = await countActiveLicenses(scope.tenantId);

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      createdAt: tenant.createdAt.toISOString(),
    },
    owner: {
      id: owner.id,
      name: owner.name ?? null,
      email: owner.email,
    },
    activeLicensesCount,
  };
}
