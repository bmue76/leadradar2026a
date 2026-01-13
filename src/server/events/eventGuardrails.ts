import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/http";
import type { Event, EventStatus } from "@prisma/client";

export type SetEventStatusWithGuardsResult = {
  event: Event;
  autoArchivedEventId: string | null;
  devicesUnboundCount: number;
};

export async function setEventStatusWithGuards(args: {
  tenantId: string;
  eventId: string;
  newStatus: EventStatus;
}): Promise<SetEventStatusWithGuardsResult> {
  const { tenantId, eventId, newStatus } = args;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.event.findFirst({
      where: { id: eventId, tenantId },
    });
    if (!existing) throw httpError(404, "NOT_FOUND", "Not found.");

    let autoArchivedEventId: string | null = null;
    let devicesUnboundCount = 0;

    // Helper: unbind devices for one event
    const unbindForEvent = async (evId: string) => {
      const res = await tx.mobileDevice.updateMany({
        where: { tenantId, activeEventId: evId },
        data: { activeEventId: null },
      });
      devicesUnboundCount += res.count;
      return res.count;
    };

    if (newStatus === "ACTIVE") {
      // Find all other ACTIVE events (defensive: could be >1 if DB got inconsistent)
      const others = await tx.event.findMany({
        where: { tenantId, status: "ACTIVE", NOT: { id: eventId } },
        select: { id: true },
        take: 50,
      });
      const otherIds = others.map((o) => o.id);
      autoArchivedEventId = otherIds.length ? otherIds[0] : null;

      if (otherIds.length) {
        // Archive all other ACTIVE events (defensive)
        await tx.event.updateMany({
          where: { tenantId, status: "ACTIVE", id: { in: otherIds } },
          data: { status: "ARCHIVED" },
        });

        // Unbind devices referencing any archived event
        const res = await tx.mobileDevice.updateMany({
          where: { tenantId, activeEventId: { in: otherIds } },
          data: { activeEventId: null },
        });
        devicesUnboundCount += res.count;
      }

      const updated = await tx.event.update({
        where: { id: eventId },
        data: { status: "ACTIVE" },
      });

      return { event: updated, autoArchivedEventId, devicesUnboundCount };
    }

    // ARCHIVED or DRAFT -> set status + unbind devices bound to this event
    const updated = await tx.event.update({
      where: { id: eventId },
      data: { status: newStatus },
    });

    await unbindForEvent(eventId);

    return { event: updated, autoArchivedEventId: null, devicesUnboundCount };
  });
}

/**
 * Device binding guard:
 * - event must exist in tenant (else 404 leak-safe)
 * - event must be ACTIVE (else 409 EVENT_NOT_ACTIVE)
 */
export async function assertEventIsBindable(args: { tenantId: string; eventId: string }): Promise<{ id: string; status: string }> {
  const { tenantId, eventId } = args;

  const ev = await prisma.event.findFirst({
    where: { id: eventId, tenantId },
    select: { id: true, status: true },
  });

  if (!ev) throw httpError(404, "NOT_FOUND", "Not found.");
  if (ev.status !== "ACTIVE") throw httpError(409, "EVENT_NOT_ACTIVE", "Event is not ACTIVE.", { eventId, status: ev.status });

  return ev;
}
