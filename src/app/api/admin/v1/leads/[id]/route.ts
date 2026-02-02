import { z } from "zod";
import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/api";
import { validateBody, isHttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant";

export const runtime = "nodejs";

const DeleteLeadBodySchema = z.object({
  reason: z
    .preprocess((v: unknown) => (typeof v === "string" ? v.trim() : v), z.string().min(1).max(256))
    .optional(),
});

const PatchLeadBodySchema = z
  .object({
    contactName: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().min(1).max(120)).optional(),

    firstName: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(120)).optional(),
    lastName: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(120)).optional(),

    company: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(200)).optional(),
    email: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(200)).optional(),
    phone: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(80)).optional(),
    mobile: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(80)).optional(),

    notes: z
      .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(2000))
      .optional()
      .nullable(),
  })
  .strict();

function toIso(d?: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function readTrimmedString(v: unknown, maxLen = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, maxLen);
}

function readIsoDateString(v: unknown): string | null {
  const s = readTrimmedString(v, 80);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function extractReviewedAt(meta: unknown): string | null {
  if (!isRecord(meta)) return null;
  return readIsoDateString(meta.reviewedAt);
}

function extractAdminNotes(meta: unknown): string | null {
  if (!isRecord(meta)) return null;
  return readTrimmedString(meta.adminNotes, 2000);
}

function extractSourceDeviceName(meta: unknown): string | null {
  if (!isRecord(meta)) return null;

  const direct =
    readTrimmedString(meta.sourceDeviceName) ??
    readTrimmedString(meta.deviceName) ??
    null;

  if (direct) return direct;

  const deviceObj = meta.device;
  if (isRecord(deviceObj)) {
    return readTrimmedString(deviceObj.name) ?? readTrimmedString(deviceObj.deviceName) ?? null;
  }

  return null;
}

function splitContactName(full: string): { firstName: string | null; lastName: string | null } {
  const t = full.trim().replace(/\s+/g, " ");
  if (!t) return { firstName: null, lastName: null };
  const parts = t.split(" ");
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  const last = parts.pop() ?? "";
  const first = parts.join(" ").trim();
  return { firstName: first || null, lastName: last || null };
}

function contactName(first: string | null, last: string | null): string | null {
  const a = (first ?? "").trim();
  const b = (last ?? "").trim();
  const s = `${a} ${b}`.trim();
  return s ? s : null;
}

function pickPhone(phone: string | null, mobile: string | null): string | null {
  const m = (mobile ?? "").trim();
  if (m) return m;
  const p = (phone ?? "").trim();
  return p ? p : null;
}

async function resolveTenantIdForAdmin(req: Request): Promise<string> {
  // Prefer session auth (prod)
  try {
    const auth = await requireAdminAuth(req);
    return auth.tenantId;
  } catch (e) {
    // DEV fallback (allows curl proof via x-tenant-slug)
    if (process.env.NODE_ENV !== "production") {
      const t = await requireTenantContext(req);
      return t.id;
    }
    throw e;
  }
}

function mergeMeta(existingMeta: unknown, patch: { notes?: string | null }): unknown | null {
  const base: Record<string, unknown> = isRecord(existingMeta) ? { ...existingMeta } : {};
  if (patch.notes !== undefined) {
    const n = typeof patch.notes === "string" ? patch.notes.trim() : null;
    if (!n) delete base.adminNotes;
    else base.adminNotes = n.slice(0, 2000);
  }
  return Object.keys(base).length ? base : null;
}

function serializeLead(lead: {
  id: string;
  formId: string;
  eventId: string | null;
  capturedAt: Date;
  values: unknown;
  meta: unknown | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  deletedReason: string | null;
  deletedByUserId: string | null;

  contactFirstName: string | null;
  contactLastName: string | null;
  contactCompany: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactMobile: string | null;
  contactSource: string | null;
  contactUpdatedAt: Date | null;

  event: { id: string; name: string } | null;
  form: { id: string; name: string } | null;

  attachments: Array<{
    id: string;
    type: string;
    filename: string;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: Date;
  }>;
}) {
  const reviewedAt = extractReviewedAt(lead.meta);
  const adminNotes = extractAdminNotes(lead.meta);
  const sourceDeviceName = extractSourceDeviceName(lead.meta);

  return {
    id: lead.id,
    formId: lead.formId,
    eventId: lead.eventId ?? null,

    capturedAt: toIso(lead.capturedAt),
    createdAt: toIso(lead.capturedAt),
    updatedAt: toIso(lead.capturedAt),

    values: lead.values ?? {},
    meta: lead.meta ?? null,

    // TP 5.7 — Review (MVP via meta.reviewedAt)
    reviewedAt,
    reviewStatus: reviewedAt ? ("REVIEWED" as const) : ("NEW" as const),

    // TP 5.7 — Admin notes (MVP via meta.adminNotes)
    adminNotes,

    // Contact (stable fields)
    contact: {
      firstName: lead.contactFirstName ?? null,
      lastName: lead.contactLastName ?? null,
      name: contactName(lead.contactFirstName, lead.contactLastName),
      company: lead.contactCompany ?? null,
      email: lead.contactEmail ?? null,
      phone: pickPhone(lead.contactPhone, lead.contactMobile),
      phoneRaw: lead.contactPhone ?? null,
      mobile: lead.contactMobile ?? null,
      source: lead.contactSource ?? null,
      updatedAt: toIso(lead.contactUpdatedAt),
    },

    // Nice-to-have meta
    sourceDeviceName,

    isDeleted: Boolean(lead.isDeleted),
    deletedAt: toIso(lead.deletedAt),
    deletedReason: lead.deletedReason ?? null,
    deletedByUserId: lead.deletedByUserId ?? null,

    event: lead.event ? { id: lead.event.id, name: lead.event.name } : null,
    form: lead.form ? { id: lead.form.id, name: lead.form.name } : null,

    attachments: (lead.attachments ?? []).map((a) => ({
      id: a.id,
      type: a.type,
      filename: a.filename,
      mimeType: a.mimeType ?? null,
      sizeBytes: typeof a.sizeBytes === "number" ? a.sizeBytes : null,
      createdAt: toIso(a.createdAt),
    })),

    hasCardAttachment: (lead.attachments ?? []).some((a) => String(a.type).toUpperCase() === "BUSINESS_CARD_IMAGE"),
  };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const tenantId = await resolveTenantIdForAdmin(req);

    const lead = await prisma.lead.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        formId: true,
        eventId: true,
        capturedAt: true,
        values: true,
        meta: true,
        isDeleted: true,
        deletedAt: true,
        deletedReason: true,
        deletedByUserId: true,

        contactFirstName: true,
        contactLastName: true,
        contactCompany: true,
        contactEmail: true,
        contactPhone: true,
        contactMobile: true,
        contactSource: true,
        contactUpdatedAt: true,

        event: { select: { id: true, name: true } },
        form: { select: { id: true, name: true } },

        attachments: {
          orderBy: { createdAt: "desc" },
          select: { id: true, type: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
    });

    if (!lead) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    return jsonOk(req, serializeLead(lead));
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL", "Unexpected server error.");
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const tenantId = await resolveTenantIdForAdmin(req);
    const body = await validateBody(req, PatchLeadBodySchema);

    const existing = await prisma.lead.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        meta: true,

        contactFirstName: true,
        contactLastName: true,
        contactCompany: true,
        contactEmail: true,
        contactPhone: true,
        contactMobile: true,
        contactSource: true,
      },
    });
    if (!existing) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    let firstName = body.firstName ?? undefined;
    let lastName = body.lastName ?? undefined;

    if ((!firstName && !lastName) && body.contactName) {
      const s = splitContactName(body.contactName);
      firstName = s.firstName ?? undefined;
      lastName = s.lastName ?? undefined;
    }

    const data: Record<string, unknown> = {};

    if (firstName !== undefined) data.contactFirstName = firstName || null;
    if (lastName !== undefined) data.contactLastName = lastName || null;
    if (body.company !== undefined) data.contactCompany = body.company || null;
    if (body.email !== undefined) data.contactEmail = body.email || null;
    if (body.phone !== undefined) data.contactPhone = body.phone || null;
    if (body.mobile !== undefined) data.contactMobile = body.mobile || null;

    const contactTouched =
      firstName !== undefined ||
      lastName !== undefined ||
      body.company !== undefined ||
      body.email !== undefined ||
      body.phone !== undefined ||
      body.mobile !== undefined;

    if (contactTouched) {
      data.contactUpdatedAt = new Date();
      // If it was never set: mark as MANUAL (do not override OCR_* aggressively)
      if (!existing.contactSource) data.contactSource = "MANUAL";
    }

    const nextMeta = mergeMeta(existing.meta, { notes: body.notes });
    if (body.notes !== undefined) data.meta = nextMeta;

    // If nothing changed, still return current
    const updated =
      Object.keys(data).length > 0
        ? await prisma.lead.update({
            where: { id: existing.id },
            data,
            select: {
              id: true,
              formId: true,
              eventId: true,
              capturedAt: true,
              values: true,
              meta: true,
              isDeleted: true,
              deletedAt: true,
              deletedReason: true,
              deletedByUserId: true,

              contactFirstName: true,
              contactLastName: true,
              contactCompany: true,
              contactEmail: true,
              contactPhone: true,
              contactMobile: true,
              contactSource: true,
              contactUpdatedAt: true,

              event: { select: { id: true, name: true } },
              form: { select: { id: true, name: true } },

              attachments: {
                orderBy: { createdAt: "desc" },
                select: { id: true, type: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
              },
            },
          })
        : await prisma.lead.findFirst({
            where: { id: existing.id, tenantId },
            select: {
              id: true,
              formId: true,
              eventId: true,
              capturedAt: true,
              values: true,
              meta: true,
              isDeleted: true,
              deletedAt: true,
              deletedReason: true,
              deletedByUserId: true,

              contactFirstName: true,
              contactLastName: true,
              contactCompany: true,
              contactEmail: true,
              contactPhone: true,
              contactMobile: true,
              contactSource: true,
              contactUpdatedAt: true,

              event: { select: { id: true, name: true } },
              form: { select: { id: true, name: true } },

              attachments: {
                orderBy: { createdAt: "desc" },
                select: { id: true, type: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
              },
            },
          });

    if (!updated) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    return jsonOk(req, serializeLead(updated));
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL", "Unexpected server error.");
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const tenantId = await resolveTenantIdForAdmin(req);
    const body = await validateBody(req, DeleteLeadBodySchema);

    const existing = await prisma.lead.findFirst({
      where: { id, tenantId },
      select: { id: true, isDeleted: true },
    });
    if (!existing) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    if (!existing.isDeleted) {
      const updated = await prisma.lead.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date(), deletedReason: body.reason ?? null },
        select: { tenantId: true },
      });
      if (updated.tenantId !== tenantId) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    }

    const lead = await prisma.lead.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        formId: true,
        eventId: true,
        capturedAt: true,
        values: true,
        meta: true,
        isDeleted: true,
        deletedAt: true,
        deletedReason: true,
        deletedByUserId: true,

        contactFirstName: true,
        contactLastName: true,
        contactCompany: true,
        contactEmail: true,
        contactPhone: true,
        contactMobile: true,
        contactSource: true,
        contactUpdatedAt: true,

        event: { select: { id: true, name: true } },
        form: { select: { id: true, name: true } },

        attachments: {
          orderBy: { createdAt: "desc" },
          select: { id: true, type: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
    });

    if (!lead) return jsonError(req, 404, "NOT_FOUND", "Not found.");
    return jsonOk(req, serializeLead(lead));
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL", "Unexpected server error.");
  }
}
