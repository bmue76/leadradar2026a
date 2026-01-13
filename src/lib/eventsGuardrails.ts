import type { EventStatus } from "@prisma/client";
import { setEventStatusWithGuards as setEventStatusWithGuardsServer } from "@/server/events/eventGuardrails";

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
 * TP 3.8 — Guardrails Konsolidierung
 * Wrapper/Compat-Layer: behält das bisherige API-Shape (item + counts),
 * aber die Logik lebt nur noch in `src/server/events/eventGuardrails.ts`.
 */
export async function setEventStatusWithGuards(args: {
  tenantId: string;
  eventId: string;
  newStatus: EventStatusInput;
}): Promise<EventStatusGuardResult> {
  const { tenantId, eventId, newStatus } = args;

  const res = await setEventStatusWithGuardsServer({
    tenantId,
    eventId,
    newStatus: newStatus as EventStatus,
  });

  const ev = res.event;

  return {
    item: {
      id: ev.id,
      tenantId: ev.tenantId,
      name: ev.name,
      location: ev.location,
      startsAt: ev.startsAt,
      endsAt: ev.endsAt,
      status: ev.status as EventStatusInput,
      createdAt: ev.createdAt,
      updatedAt: ev.updatedAt,
    },
    autoArchivedEventId: res.autoArchivedEventId,
    devicesUnboundCount: res.devicesUnboundCount,
  };
}
