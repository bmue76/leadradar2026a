import { z } from "zod";
import { Prisma } from "@prisma/client";

import { jsonError, jsonOk } from "@/lib/api";
import { isHttpError, validateBody } from "@/lib/http";
import { requireAdminAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function trimToNull(v: string): string | null {
  const t = v.trim();
  return t.length ? t : null;
}

const optionalTrimmedString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    return trimToNull(v);
  });

const optionalEmail = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    return trimToNull(v);
  })
  .superRefine((val, ctx) => {
    if (val === undefined || val === null) return;
    const ok = z.string().email().safeParse(val).success;
    if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ungültige E-Mail-Adresse." });
  });

const optionalHexColor = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    return trimToNull(v);
  })
  .superRefine((val, ctx) => {
    if (val === undefined || val === null) return;
    if (!/^#[0-9A-Fa-f]{6}$/.test(val)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Akzentfarbe muss #RRGGBB sein." });
  });

const optionalCountryCode = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    return trimToNull(v);
  })
  .superRefine((val, ctx) => {
    if (val === undefined || val === null) return;
    if (!/^[A-Za-z]{2}$/.test(val)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ländercode muss 2 Buchstaben sein (z.B. CH)." });
  })
  .transform((val) => {
    if (val === undefined) return undefined;
    if (val === null) return null;
    return val.toUpperCase();
  });

const PatchBrandingBody = z.object({
  legalName: z.string().trim().min(2, "Firmenname muss mind. 2 Zeichen haben."),
  displayName: optionalTrimmedString,

  addressLine1: optionalTrimmedString,
  addressLine2: optionalTrimmedString,
  postalCode: optionalTrimmedString,
  city: optionalTrimmedString,
  countryCode: optionalCountryCode,

  vatId: optionalTrimmedString,

  contactGivenName: optionalTrimmedString,
  contactFamilyName: optionalTrimmedString,
  contactEmail: optionalEmail,

  accentColor: optionalHexColor,
});

export async function GET(req: Request) {
  try {
    const ctx = await requireAdminAuth(req);

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, slug: true, name: true, country: true, accentColor: true },
    });

    // leak-safe
    if (!tenant) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const profile = await prisma.tenantProfile.findUnique({
      where: { tenantId: ctx.tenantId },
    });

    return jsonOk(req, { tenant, profile });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireAdminAuth(req);
    const body = await validateBody(req, PatchBrandingBody);

    const existingTenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true },
    });

    // leak-safe
    if (!existingTenant) return jsonError(req, 404, "NOT_FOUND", "Not found.");

    const normalizedCountry: string | undefined = (() => {
      if (body.countryCode === undefined) return undefined; // unchanged
      if (body.countryCode === null) return "CH"; // default
      return body.countryCode;
    })();

    const profileCreate: Prisma.TenantProfileCreateInput = {
      tenant: { connect: { id: ctx.tenantId } },

      legalName: body.legalName.trim(),
      displayName: body.displayName ?? null,

      addressLine1: body.addressLine1 ?? null,
      addressLine2: body.addressLine2 ?? null,
      postalCode: body.postalCode ?? null,
      city: body.city ?? null,
      countryCode: normalizedCountry ?? "CH",

      vatId: body.vatId ?? null,

      contactGivenName: body.contactGivenName ?? null,
      contactFamilyName: body.contactFamilyName ?? null,
      contactEmail: body.contactEmail ?? null,

      accentColor: body.accentColor ?? null,
    };

    const profileUpdate: Prisma.TenantProfileUpdateInput = {
      legalName: body.legalName.trim(),

      ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),

      ...(body.addressLine1 !== undefined ? { addressLine1: body.addressLine1 } : {}),
      ...(body.addressLine2 !== undefined ? { addressLine2: body.addressLine2 } : {}),
      ...(body.postalCode !== undefined ? { postalCode: body.postalCode } : {}),
      ...(body.city !== undefined ? { city: body.city } : {}),
      ...(normalizedCountry !== undefined ? { countryCode: normalizedCountry } : {}),

      ...(body.vatId !== undefined ? { vatId: body.vatId } : {}),

      ...(body.contactGivenName !== undefined ? { contactGivenName: body.contactGivenName } : {}),
      ...(body.contactFamilyName !== undefined ? { contactFamilyName: body.contactFamilyName } : {}),
      ...(body.contactEmail !== undefined ? { contactEmail: body.contactEmail } : {}),

      ...(body.accentColor !== undefined ? { accentColor: body.accentColor } : {}),
    };

    const tenantUpdateData: Prisma.TenantUpdateInput = {
      // Backward-Compat: Tenant.name bleibt konsistent
      name: (body.displayName ?? body.legalName).trim(),

      ...(normalizedCountry !== undefined ? { country: normalizedCountry } : {}),
      ...(body.accentColor !== undefined ? { accentColor: body.accentColor } : {}),
    };

    const [profile, tenant] = await prisma.$transaction([
      prisma.tenantProfile.upsert({
        where: { tenantId: ctx.tenantId },
        create: profileCreate,
        update: profileUpdate,
      }),
      prisma.tenant.update({
        where: { id: ctx.tenantId },
        data: tenantUpdateData,
        select: { id: true, slug: true, name: true, country: true, accentColor: true },
      }),
    ]);

    return jsonOk(req, { tenant, profile });
  } catch (e) {
    if (isHttpError(e)) return jsonError(req, e.status, e.code, e.message, e.details);
    console.error(e);
    return jsonError(req, 500, "INTERNAL_ERROR", "Unexpected error.");
  }
}
