import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

import { writeExportFile } from "./_storage";
import type { ExportJobParams } from "./_repo";

type ExportCreateInput = {
  tenantId: string;
  traceId: string;
  jobId: string;
  params: ExportJobParams;
};

type LeadRow = Prisma.LeadGetPayload<{
  include: {
    form: { select: { id: true; name: true } };
    attachments: { select: { id: true } };
  };
}>;

function isJsonObject(v: Prisma.JsonValue | null | undefined): v is Prisma.JsonObject {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Heuristics for event-id stored in Lead.meta (supports multiple historic keys).
 */
function getLeadEventId(meta: Prisma.JsonValue | null | undefined): string | undefined {
  if (!isJsonObject(meta)) return undefined;
  const m = meta as Record<string, Prisma.JsonValue>;
  const candidates: Prisma.JsonValue[] = [
    m.eventId,
    m.activeEventId,
    m.event_id,
    m.active_event_id,
    m.activeEvent,
    m.event,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c) return c;
  }
  return undefined;
}

function getReviewedAt(meta: Prisma.JsonValue | null | undefined): string | undefined {
  if (!isJsonObject(meta)) return undefined;
  const v = (meta as Record<string, Prisma.JsonValue>).reviewedAt;
  return typeof v === "string" ? v : undefined;
}

function getAdminNotes(meta: Prisma.JsonValue | null | undefined): string | undefined {
  if (!isJsonObject(meta)) return undefined;
  const v = (meta as Record<string, Prisma.JsonValue>).adminNotes;
  return typeof v === "string" ? v : undefined;
}

/**
 * Minimal CSV escaping for delimiter ';' with Excel compatibility.
 * Always quotes and doubles internal quotes.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let s: string;
  if (typeof value === "string") s = value;
  else if (typeof value === "number" || typeof value === "boolean") s = String(value);
  else s = JSON.stringify(value);

  s = s.replace(/\r?\n/g, " ").trim();
  s = s.replace(/"/g, '""');
  return `"${s}"`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatTsForFile(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(
    d.getMinutes()
  )}`;
}

export async function runCsvExportCreate(input: ExportCreateInput): Promise<{
  storageKey: string;
  fileName: string;
  rowCount: number;
  title: string;
  paramsPatch: Partial<ExportJobParams>;
}> {
  const { tenantId, jobId, params } = input;

  let activeEvent: null | { id: string; name: string } = null;
  if (params.scope === "ACTIVE_EVENT") {
    const ev = await prisma.event.findFirst({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    if (!ev) throw new Error("NO_ACTIVE_EVENT");
    activeEvent = { id: ev.id, name: ev.name };
  }

  const leads: LeadRow[] = await prisma.lead.findMany({
    where: { tenantId },
    orderBy: [{ capturedAt: "desc" }],
    include: {
      form: { select: { id: true, name: true } },
      attachments: { select: { id: true } },
    },
  });

  const q = params.q?.trim();
  const qLower = q ? q.toLowerCase() : null;

  const filtered = leads.filter((l) => {
    if (params.scope === "ACTIVE_EVENT") {
      const leadEventId = getLeadEventId(l.meta);
      if (!leadEventId || leadEventId !== activeEvent!.id) return false;
    }

    const reviewedAt = getReviewedAt(l.meta);
    if (params.leadStatus === "NEW") {
      if (reviewedAt) return false;
    } else if (params.leadStatus === "REVIEWED") {
      if (!reviewedAt) return false;
    }

    if (qLower) {
      const hay = `${JSON.stringify(l.values ?? {})} ${JSON.stringify(l.meta ?? {})}`.toLowerCase();
      if (!hay.includes(qLower)) return false;
    }

    return true;
  });

  const fieldKeys = new Set<string>();
  for (const l of filtered) {
    if (isJsonObject(l.values)) {
      for (const k of Object.keys(l.values)) fieldKeys.add(k);
    }
  }
  const sortedFieldKeys = Array.from(fieldKeys).sort((a, b) => a.localeCompare(b, "de-CH"));

  const header = [
    "lead_id",
    "captured_at",
    "form_id",
    "form_name",
    "event_id",
    "event_name",
    "reviewed_at",
    "admin_notes",
    "attachment_count",
  ].concat(sortedFieldKeys.map((k) => `field_${k}`));

  const lines: string[] = [];
  lines.push(header.map(csvCell).join(";"));

  for (const l of filtered) {
    const eventId = getLeadEventId(l.meta);
    const reviewedAt = getReviewedAt(l.meta);
    const adminNotes = getAdminNotes(l.meta);

    const baseRow: unknown[] = [
      l.id,
      l.capturedAt.toISOString(),
      l.formId,
      l.form?.name ?? "",
      eventId ?? "",
      eventId && activeEvent && eventId === activeEvent.id ? activeEvent.name : "",
      reviewedAt ?? "",
      adminNotes ?? "",
      Array.isArray(l.attachments) ? l.attachments.length : 0,
    ];

    const dyn: unknown[] = sortedFieldKeys.map((k) => {
      if (!isJsonObject(l.values)) return "";
      const v = (l.values as Record<string, Prisma.JsonValue>)[k];
      return v ?? "";
    });

    lines.push(baseRow.concat(dyn).map(csvCell).join(";"));
  }

  const csv = "\ufeff" + lines.join("\n") + "\n";

  const now = new Date();
  const ts = formatTsForFile(now);
  const scopeLabel = params.scope === "ACTIVE_EVENT" ? "active-event" : "all";
  const statusLabel = params.leadStatus.toLowerCase();
  const fileName = `leadradar-export_${ts}_${scopeLabel}_${statusLabel}.csv`;

  const storageKey = `exports/${tenantId}/${jobId}/${fileName}`;
  await writeExportFile(storageKey, Buffer.from(csv, "utf8"));

  const titleParts: string[] = [];
  titleParts.push(params.scope === "ACTIVE_EVENT" ? "Aktives Event" : "Alle");
  if (params.scope === "ACTIVE_EVENT" && activeEvent) titleParts.push(`(${activeEvent.name})`);
  if (params.leadStatus === "NEW") titleParts.push("– Nur neue");
  else if (params.leadStatus === "REVIEWED") titleParts.push("– Nur bearbeitet");
  else titleParts.push("– Alle Leads");
  if (q) titleParts.push(`– Suche: "${q}"`);

  const title = titleParts.join(" ");

  const paramsPatch: Partial<ExportJobParams> = {
    title,
    rowCount: filtered.length,
    fileName,
    activeEventId: activeEvent?.id,
    activeEventName: activeEvent?.name,
  };

  return { storageKey, fileName, rowCount: filtered.length, title, paramsPatch };
}
