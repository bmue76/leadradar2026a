import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/http";
import { Prisma, type Event, type EventStatus } from "@prisma/client";

export type SetEventStatusWithGuardsResult = {
  event: Event;
  autoArchivedEventId: string | null;
  devicesUnboundCount: number;
};

/**
 * TP 3.7/3.8 — Event Guardrails (ONLINE-only, MVP)
 * Single Source of Truth:
 * - setEventStatusWithGuards: status changes + ops-safe device unbind
 * - assertEventIsBindable: only ACTIVE bindable
 *
 * Multi-ACTIVE:
 * - Multiple ACTIVE events are allowed.
 * - No auto-archiving of other ACTIVE events.
 *
 * Notes:
 * - tenant-scoped + leak-safe (id+tenantId lookup => else 404)
 * - best-effort Serializable TX + retry on P2034 (write-conflict)
 */
export async function setEventStatusWithGuards(args: {
  tenantId: string;
  eventId: string;
  newStatus: EventStatus;
}): Promise<SetEventStatusWithGuardsResult> {
  const { tenantId, eventId, newStatus } = args;

  async function runOnce(): Promise<SetEventStatusWithGuardsResult> {
    return prisma.$transaction(
      async (tx) => {
        const existing = await tx.event.findFirst({
          where: { id: eventId, tenantId },
          select: { id: true, status: true },
        });

        if (!existing) throw httpError(404, "NOT_FOUND", "Not found.");

        // Keep archive "final" (align with admin repo behaviour)
        if (existing.status === "ARCHIVED" && newStatus === "ACTIVE") {
          throw httpError(409, "EVENT_ARCHIVED", "Event is ARCHIVED.");
        }

        let devicesUnboundCount = 0;

        // Any non-ACTIVE status => unbind devices pointing to this event (ops-safe, defensive)
        if (newStatus !== "ACTIVE") {
          const unbindRes = await tx.mobileDevice.updateMany({
            where: { tenantId, activeEventId: eventId },
            data: { activeEventId: null },
          });
          devicesUnboundCount = unbindRes.count;
        }

        await tx.event.updateMany({
          where: { id: eventId, tenantId },
          data: { status: newStatus },
        });

        const event = await tx.event.findFirst({
          where: { id: eventId, tenantId },
        });

        if (!event) throw httpError(404, "NOT_FOUND", "Not found.");

        // Multi-ACTIVE => never auto-archive others
        const autoArchivedEventId: string | null = null;

        return { event, autoArchivedEventId, devicesUnboundCount };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  // best-effort retry on write conflict / deadlock
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await runOnce();
    } catch (e) {
      const retryable =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
      if (retryable && attempt === 0) continue;
      throw e;
    }
  }

  throw httpError(500, "INTERNAL", "Unexpected error.");
}

/**
 * Device binding guard:
 * - event must exist in tenant (else 404 leak-safe)
 * - event must be ACTIVE (else 409 EVENT_NOT_ACTIVE)
 */
export async function assertEventIsBindable(args: {
  tenantId: string;
  eventId: string;
}): Promise<{ id: string; status: EventStatus }> {
  const { tenantId, eventId } = args;

  const ev = await prisma.event.findFirst({
    where: { id: eventId, tenantId },
    select: { id: true, status: true },
  });

  if (!ev) throw httpError(404, "NOT_FOUND", "Not found.");
  if (ev.status !== "ACTIVE") {
    throw httpError(409, "EVENT_NOT_ACTIVE", "Event is not ACTIVE.", {
      eventId,
      status: ev.status,
    });
  }

  return ev;
}
