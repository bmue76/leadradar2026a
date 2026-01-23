import { z } from "zod";
import { NextRequest } from "next/server";
import { LeadContactSource } from "@prisma/client";

import { jsonError, jsonOk } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import { requireMobileAuth } from "@/lib/mobileAuth";
import { validateBody, isHttpError } from "@/lib/http";

export const runtime = "nodejs";

const OptStr = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  return t ? t : undefined; // leere Strings -> undefined
}, z.string().min(1).optional());

function normalizeContactSource(v: unknown): LeadContactSource | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;

  const allowed = new Set(Object.values(LeadContactSource) as string[]);
  if (allowed.has(t)) return t as LeadContactSource;

  // mobile alias
  if (t === "QR_VCARD") {
    // try a few common enum variants safely
    for (const candidate of ["QR", "VCARD", "QR_CODE", "QRVCARD", "QR_VCARD"]) {
      if (allowed.has(candidate)) return candidate as LeadContactSource;
    }
    // fallback: if MANUAL exists, map to it; otherwise omit field
    if (allowed.has("MANUAL")) return "MANUAL" as LeadContactSource;
    return undefined;
  }

  return undefined;
}

const ContactPatchBodySchema = z
  .object({
    // meta (string, we normalize to prisma enum)
    contactSource: OptStr,

    // accept but do NOT write to Lead (not a Lead column)
    contactOcrResultId: OptStr,
    ocrResultId: OptStr,

    // mobile shape
    contactFirstName: OptStr,
    contactLastName: OptStr,
    contactEmail: OptStr,
    contactPhone: OptStr,
    contactMobile: OptStr,
    contactCompany: OptStr,
    contactTitle: OptStr,
    contactWebsite: OptStr,
    contactStreet: OptStr,
    contactZip: OptStr,
    contactCity: OptStr,
    contactCountry: OptStr,

    // legacy/unprefixed aliases
    firstName: OptStr,
    lastName: OptStr,
    email: OptStr,
    phone: OptStr,
    mobile: OptStr,
    company: OptStr,
    title: OptStr,
    website: OptStr,
    street: OptStr,
    zip: OptStr,
    city: OptStr,
    country: OptStr,
  })
  .passthrough();

async function updateMobileTelemetry(auth: { apiKeyId: string; deviceId: string }) {
  const now = new Date();
  await prisma.mobileApiKey.update({ where: { id: auth.apiKeyId }, data: { lastUsedAt: now } });
  await prisma.mobileDevice.update({ where: { id: auth.deviceId }, data: { lastSeenAt: now } });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireMobileAuth(req);
    enforceRateLimit(`mobile:${auth.apiKeyId}:lead_contact_patch`, { limit: 120, windowMs: 60_000 });

    await updateMobileTelemetry(auth);

    const body = await validateBody(req, ContactPatchBodySchema, 128 * 1024);
    const leadId = (await ctx.params).id;

    const contactSource = normalizeContactSource(body.contactSource);

    const data = {
      ...(contactSource ? { contactSource } : {}),

      contactFirstName: body.contactFirstName ?? body.firstName ?? undefined,
      contactLastName: body.contactLastName ?? body.lastName ?? undefined,
      contactEmail: body.contactEmail ?? body.email ?? undefined,
      contactPhone: body.contactPhone ?? body.phone ?? undefined,
      contactMobile: body.contactMobile ?? body.mobile ?? undefined,
      contactCompany: body.contactCompany ?? body.company ?? undefined,
      contactTitle: body.contactTitle ?? body.title ?? undefined,
      contactWebsite: body.contactWebsite ?? body.website ?? undefined,
      contactStreet: body.contactStreet ?? body.street ?? undefined,
      contactZip: body.contactZip ?? body.zip ?? undefined,
      contactCity: body.contactCity ?? body.city ?? undefined,
      contactCountry: body.contactCountry ?? body.country ?? undefined,
    };

    const res = await prisma.lead.updateMany({
      where: { id: leadId, tenantId: auth.tenantId },
      data,
    });

    if (res.count === 0) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    return jsonOk(req, { ok: true });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    return jsonError(req, 500, "INTERNAL", "Unexpected error.");
  }
}
