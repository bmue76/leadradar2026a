import { httpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

function asIsoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/**
 * GoLive Regel:
 * Hardblock nur Mobile Capture (Forms list, Lead create, Attachment upload/OCR upload)
 * wenn keine aktive Lizenz: validUntil null oder now > validUntil
 */
export async function enforceMobileCaptureLicense(tenantId: string): Promise<{ validUntil: Date | null }> {
  const ent = await prisma.tenantEntitlement.findUnique({
    where: { tenantId },
    select: { validUntil: true },
  });

  const now = new Date();
  const validUntil = ent?.validUntil ?? null;

  if (!validUntil || validUntil.getTime() < now.getTime()) {
    throw httpError(
      402,
      "PAYMENT_REQUIRED",
      "Deine Messe-Lizenz ist abgelaufen. Bitte verlängern.",
      { validUntil: asIsoOrNull(validUntil) }
    );
  }

  return { validUntil };
}
