import { Prisma } from "@prisma/client";
import { httpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export type EventStatusInput = "DRAFT" | "ACTIVE" | "ARCHIVED";

export type EventStatusGuardResult = {
  item: {
    id: string;
    tenantId: string;
    name: string;
    location: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    status: EventStatusInput;
    createdAt: Date;
    updatedAt: Date;
  };
  autoArchivedEventId: string | null;
  devicesUnboundCount: number;
};

/**
 * TP 3.7 — Event Guardrails (ONLINE-only, MVP)
 * - Invariant: max 1 ACTIVE Event pro Tenant
 *   => beim Aktivieren werden alle anderen ACTIVE Events tenant-scoped auf ARCHIVED gesetzt
 * - Ops Safety: wenn ein Event nicht mehr ACTIVE ist (DRAFT/ARCHIVED), werden Devices unbound (activeEventId=null)
 * - tenant-scoped + leak-safe: event lookup immer { id, tenantId } => sonst 404
 *
 * NOTE: Da kein DB-Constraint möglich ist (multi-row uniqueness), nutzen wir SERIALIZABLE TX + Retry (best-effort),
 * um Write-Conflicts sauber abzufangen (Prisma Code P2034).
 */
export async function setEventStatusWithGuards(args: {
  tenantId: string;
  eventId: string;
  newStatus: EventStatusInput;
}): Promise<EventStatusGuardResult> {
  const { tenantId, eventId, newStatus } = args;

  async function runOnce(): Promise<EventStatusGuardResult> {
    return prisma.$transaction(
      async (tx) => {
        const existing = await tx.event.findFirst({
          where: { id: eventId, tenantId },
          select: { id: true, status: true },
        });

        if (!existing) throw httpError(404, "NOT_FOUND", "Not found.");

        let autoArchivedEventId: string | null = null;
        let devicesUnboundCount = 0;

        if (newStatus === "ACTIVE") {
          // Archive ALL other ACTIVE events (defensive: clean up if system already inconsistent)
          const others = await tx.event.findMany({
            where: { tenantId, status: "ACTIVE", id: { not: eventId } },
            select: { id: true },
            take: 50,
          });

          const otherIds = others.map((o) => o.id);
          if (otherIds.length > 0) {
            autoArchivedEventId = otherIds[0] ?? null;

            await tx.event.updateMany({
              where: { tenantId, id: { in: otherIds } },
              data: { status: "ARCHIVED" },
            });

            const unbindRes = await tx.mobileDevice.updateMany({
              where: { tenantId, activeEventId: { in: otherIds } },
              data: { activeEventId: null },
            });

            devicesUnboundCount += unbindRes.count;
          }

          await tx.event.updateMany({
            where: { id: eventId, tenantId },
            data: { status: "ACTIVE" },
          });
        } else {
          // Any non-ACTIVE status => unbind devices pointing to this event (ops-safe, defensive)
          const unbindRes = await tx.mobileDevice.updateMany({
            where: { tenantId, activeEventId: eventId },
            data: { activeEventId: null },
          });
          devicesUnboundCount += unbindRes.count;

          await tx.event.updateMany({
            where: { id: eventId, tenantId },
            data: { status: newStatus },
          });
        }

        const item = await tx.event.findFirst({
          where: { id: eventId, tenantId },
          select: {
            id: true,
            tenantId: true,
            name: true,
            location: true,
            startsAt: true,
            endsAt: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        if (!item) throw httpError(404, "NOT_FOUND", "Not found.");

        return {
          item: {
            ...item,
            status: item.status as EventStatusInput,
          },
          autoArchivedEventId,
          devicesUnboundCount,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  // best-effort retry on write conflict / deadlock
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await runOnce();
    } catch (e) {
      const retryable = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
      if (retryable && attempt === 0) continue;
      throw e;
    }
  }

  // unreachable
  throw httpError(500, "INTERNAL", "Unexpected error.");
}
