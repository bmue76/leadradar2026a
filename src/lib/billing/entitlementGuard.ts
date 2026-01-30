import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/http";

function nowUtc(): Date {
  return new Date();
}

export async function requireMobileCaptureLicense(tenantId: string) {
  const now = nowUtc();

  // Ensure row exists (MVP: default maxDevices=1, validUntil=null)
  const ent =
    (await prisma.tenantEntitlement.findUnique({ where: { tenantId } })) ??
    (await prisma.tenantEntitlement.create({
      data: { tenantId, validUntil: null, maxDevices: 1 },
    }));

  const validUntil = ent.validUntil;

  if (!validUntil || now.getTime() > validUntil.getTime()) {
    throw httpError(
      402,
      "PAYMENT_REQUIRED",
      "Deine Messe-Lizenz ist abgelaufen. Bitte verlängern.",
      { validUntil: validUntil ? validUntil.toISOString() : null }
    );
  }

  return { validUntil: validUntil.toISOString() };
}
