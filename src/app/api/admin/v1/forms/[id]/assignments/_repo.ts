import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/http";

function assertPrismaModelAvailable() {
  const anyPrisma = prisma as unknown as Record<string, unknown>;
  if (!("eventFormAssignment" in anyPrisma)) {
    throw httpError(
      500,
      "PRISMA_CLIENT_OUTDATED",
      "Prisma client is out of date. Run `npx prisma generate` and restart the dev server."
    );
  }
}

export async function assertFormOwned(tenantId: string, formId: string) {
  const form = await prisma.form.findFirst({
    where: { id: formId, tenantId },
    select: { id: true },
  });
  if (!form) throw httpError(404, "NOT_FOUND", "Not found.");
}

export async function listFormAssignmentEventIds(tenantId: string, formId: string): Promise<string[]> {
  assertPrismaModelAvailable();
  await assertFormOwned(tenantId, formId);

  const rows = await prisma.eventFormAssignment.findMany({
    where: { tenantId, formId },
    select: { eventId: true },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  return rows.map((r) => r.eventId);
}

export async function replaceFormAssignmentEventIds(
  tenantId: string,
  formId: string,
  eventIds: string[]
): Promise<string[]> {
  assertPrismaModelAvailable();
  await assertFormOwned(tenantId, formId);

  const uniq = Array.from(new Set(eventIds.filter(Boolean)));

  // Leak-safe: all eventIds must exist in same tenant, otherwise 404
  if (uniq.length > 0) {
    const existing = await prisma.event.findMany({
      where: { tenantId, id: { in: uniq } },
      select: { id: true },
      take: uniq.length,
    });
    if (existing.length !== uniq.length) throw httpError(404, "NOT_FOUND", "Not found.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.eventFormAssignment.deleteMany({
      where: { tenantId, formId },
    });

    if (uniq.length > 0) {
      await tx.eventFormAssignment.createMany({
        data: uniq.map((eventId) => ({ tenantId, eventId, formId })),
        skipDuplicates: true,
      });
    }

    // Backward-compat mirror:
    // - exactly one event => keep legacy assignedEventId
    // - global (0) or multi (>1) => legacy assignedEventId = null
    const legacyAssignedEventId = uniq.length === 1 ? uniq[0] : null;

    await tx.form.updateMany({
      where: { id: formId, tenantId },
      data: { assignedEventId: legacyAssignedEventId },
    });
  });

  return uniq;
}
