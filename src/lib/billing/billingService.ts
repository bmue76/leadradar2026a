import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/http";
import type { BillingOverview, CreditType, ConsumeAction } from "@/lib/billing/billingTypes";

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function isWithinWindow(now: Date, validFrom: Date | null, validUntil: Date | null): boolean {
  if (validFrom && now.getTime() < validFrom.getTime()) return false;
  if (validUntil && now.getTime() > validUntil.getTime()) return false;
  return true;
}

async function ensureEntitlement(tenantId: string) {
  // Ensure row exists (MVP default: validUntil null, maxDevices 1)
  const existing = await prisma.tenantEntitlement.findUnique({ where: { tenantId }, select: { tenantId: true } });
  if (existing) return;

  await prisma.tenantEntitlement.create({
    data: {
      tenantId,
      validUntil: null,
      maxDevices: 1,
    },
    select: { tenantId: true },
  });
}

async function countActiveDevices(tenantId: string): Promise<number> {
  // "activeDevices" = device with ACTIVE device status and ACTIVE api key
  return prisma.mobileDevice.count({
    where: {
      tenantId,
      status: "ACTIVE",
      apiKey: { status: "ACTIVE" },
    },
  });
}

async function getEntitlementSnapshot(tenantId: string) {
  await ensureEntitlement(tenantId);

  const ent = await prisma.tenantEntitlement.findUnique({
    where: { tenantId },
    select: { validUntil: true, maxDevices: true },
  });

  const now = new Date();
  const validUntil = ent?.validUntil ?? null;
  const maxDevices = ent?.maxDevices ?? 1;
  const activeDevices = await countActiveDevices(tenantId);

  const isActive = Boolean(validUntil && validUntil.getTime() >= now.getTime());

  return {
    validUntil,
    isActive,
    maxDevices,
    activeDevices,
  };
}

async function listCreditBalances(tenantId: string) {
  const now = new Date();

  const credits = await prisma.tenantCreditBalance.findMany({
    where: {
      tenantId,
      quantity: { gt: 0 },
      expiresAt: { gte: now },
    },
    select: { type: true, quantity: true, expiresAt: true },
    orderBy: [{ expiresAt: "asc" }],
  });

  const soonLimit = addDays(now, 30);
  const expiringSoonCount = credits
    .filter((c) => c.expiresAt.getTime() <= soonLimit.getTime())
    .reduce((sum, c) => sum + c.quantity, 0);

  return {
    credits,
    expiringSoonCount,
  };
}

export async function getBillingOverview(tenantId: string): Promise<BillingOverview> {
  const ent = await getEntitlementSnapshot(tenantId);
  const { credits, expiringSoonCount } = await listCreditBalances(tenantId);

  return {
    entitlement: {
      validUntil: toIso(ent.validUntil),
      isActive: ent.isActive,
      maxDevices: ent.maxDevices,
      activeDevices: ent.activeDevices,
    },
    credits: credits.map((c) => ({
      type: c.type as CreditType,
      quantity: c.quantity,
      expiresAt: c.expiresAt.toISOString(),
    })),
    expiringSoon: { count: expiringSoonCount },
  };
}

async function validatePromoCodeOrThrow(codeRaw: string) {
  const code = codeRaw.trim();
  if (!code) throw httpError(400, "INVALID_CODE", "Ungültiger Gutscheincode.");

  const promo = await prisma.promoCode.findFirst({
    where: {
      code: { equals: code, mode: "insensitive" },
    },
    select: {
      id: true,
      code: true,
      active: true,
      validFrom: true,
      validUntil: true,
      maxRedemptions: true,
      redeemedCount: true,
      grantLicense30d: true,
      grantLicense365d: true,
      grantDeviceSlots: true,
      creditExpiresInDays: true,
    },
  });

  if (!promo) throw httpError(400, "INVALID_CODE", "Ungültiger Gutscheincode.");

  const now = new Date();

  if (!promo.active) throw httpError(400, "INVALID_CODE", "Ungültiger Gutscheincode.");
  if (!isWithinWindow(now, promo.validFrom ?? null, promo.validUntil ?? null)) {
    throw httpError(400, "CODE_EXPIRED", "Dieser Gutscheincode ist abgelaufen.");
  }
  if (promo.redeemedCount >= promo.maxRedemptions) {
    throw httpError(400, "CODE_LIMIT_REACHED", "Dieser Gutscheincode wurde bereits verwendet.");
  }

  const expiresInDays = promo.creditExpiresInDays && promo.creditExpiresInDays > 0 ? promo.creditExpiresInDays : 365;
  const expiresAt = addDays(now, expiresInDays);

  return { promo, expiresAt };
}

export async function redeemPromoCodeAdmin(tenantId: string, code: string): Promise<BillingOverview> {
  const { promo, expiresAt } = await validatePromoCodeOrThrow(code);

  await prisma.$transaction(async (tx) => {
    // Ensure not redeemed twice for same tenant (if unique exists)
    await tx.promoRedemption.create({
      data: {
        promoCodeId: promo.id,
        tenantId,
        redeemedAt: new Date(),
      },
      select: { promoCodeId: true },
    });

    // Atomic redeemCount increment with guard
    const upd = await tx.promoCode.updateMany({
      where: { id: promo.id, redeemedCount: { lt: promo.maxRedemptions } },
      data: { redeemedCount: { increment: 1 } },
    });
    if (upd.count !== 1) throw httpError(400, "CODE_LIMIT_REACHED", "Dieser Gutscheincode wurde bereits verwendet.");

    const refId = promo.id;

    if (promo.grantLicense30d > 0) {
      await tx.tenantCreditBalance.upsert({
        where: { tenantId_type_expiresAt: { tenantId, type: "LICENSE_30D", expiresAt } },
        create: { tenantId, type: "LICENSE_30D", quantity: promo.grantLicense30d, expiresAt },
        update: { quantity: { increment: promo.grantLicense30d } },
      });
      await tx.tenantCreditLedger.create({
        data: { tenantId, type: "LICENSE_30D", delta: promo.grantLicense30d, reason: "COUPON_REDEEM", refId },
      });
    }

    if (promo.grantLicense365d > 0) {
      await tx.tenantCreditBalance.upsert({
        where: { tenantId_type_expiresAt: { tenantId, type: "LICENSE_365D", expiresAt } },
        create: { tenantId, type: "LICENSE_365D", quantity: promo.grantLicense365d, expiresAt },
        update: { quantity: { increment: promo.grantLicense365d } },
      });
      await tx.tenantCreditLedger.create({
        data: { tenantId, type: "LICENSE_365D", delta: promo.grantLicense365d, reason: "COUPON_REDEEM", refId },
      });
    }

    if (promo.grantDeviceSlots > 0) {
      await tx.tenantCreditBalance.upsert({
        where: { tenantId_type_expiresAt: { tenantId, type: "DEVICE_SLOT", expiresAt } },
        create: { tenantId, type: "DEVICE_SLOT", quantity: promo.grantDeviceSlots, expiresAt },
        update: { quantity: { increment: promo.grantDeviceSlots } },
      });
      await tx.tenantCreditLedger.create({
        data: { tenantId, type: "DEVICE_SLOT", delta: promo.grantDeviceSlots, reason: "COUPON_REDEEM", refId },
      });
    }
  });

  return getBillingOverview(tenantId);
}

async function pickBalanceToConsume(tenantId: string, type: CreditType) {
  const now = new Date();

  const balance = await prisma.tenantCreditBalance.findFirst({
    where: { tenantId, type, quantity: { gt: 0 }, expiresAt: { gte: now } },
    select: { id: true, quantity: true, expiresAt: true },
    orderBy: [{ expiresAt: "asc" }],
  });

  if (balance) return { balance, expiredOnly: false };

  const expired = await prisma.tenantCreditBalance.findFirst({
    where: { tenantId, type, quantity: { gt: 0 }, expiresAt: { lt: now } },
    select: { id: true },
    orderBy: [{ expiresAt: "asc" }],
  });

  if (expired) return { balance: null, expiredOnly: true };
  return { balance: null, expiredOnly: false };
}

export async function consumeCreditAdmin(tenantId: string, action: ConsumeAction): Promise<BillingOverview> {
  const type: CreditType =
    action === "ADD_DEVICE_SLOT" ? "DEVICE_SLOT" : action === "ACTIVATE_LICENSE_365D" ? "LICENSE_365D" : "LICENSE_30D";

  await prisma.$transaction(async (tx) => {
    await ensureEntitlement(tenantId);

    const now = new Date();
    const picked = await pickBalanceToConsume(tenantId, type);

    if (!picked.balance) {
      if (picked.expiredOnly) throw httpError(400, "CREDITS_EXPIRED", "Deine Credits sind abgelaufen.");
      throw httpError(400, "NO_CREDITS", "Keine Credits verfügbar.");
    }

    // decrement 1
    await tx.tenantCreditBalance.update({
      where: { id: picked.balance.id },
      data: { quantity: { decrement: 1 } },
      select: { id: true },
    });

    await tx.tenantCreditLedger.create({
      data: { tenantId, type, delta: -1, reason: "CREDIT_CONSUME", refId: null },
      select: { id: true },
    });

    if (action === "ADD_DEVICE_SLOT") {
      await tx.tenantEntitlement.update({
        where: { tenantId },
        data: { maxDevices: { increment: 1 } },
        select: { tenantId: true },
      });
      return;
    }

    const days = action === "ACTIVATE_LICENSE_365D" ? 365 : 30;

    const current = await tx.tenantEntitlement.findUnique({
      where: { tenantId },
      select: { validUntil: true },
    });

    const base = current?.validUntil && current.validUntil.getTime() > now.getTime() ? current.validUntil : now;
    const next = addDays(base, days);

    await tx.tenantEntitlement.update({
      where: { tenantId },
      data: { validUntil: next },
      select: { tenantId: true },
    });
  });

  return getBillingOverview(tenantId);
}

export async function getMobileBillingStatus(tenantId: string): Promise<{ isActive: boolean; validUntil: string | null }> {
  const ent = await getEntitlementSnapshot(tenantId);
  return { isActive: ent.isActive, validUntil: toIso(ent.validUntil) };
}

export async function redeemAndActivateMobile(tenantId: string, code: string): Promise<{ isActive: boolean; validUntil: string | null }> {
  const { promo, expiresAt } = await validatePromoCodeOrThrow(code);

  // Coupon must contain a license credit for in-app activation
  const willActivate365 = promo.grantLicense365d > 0;
  const willActivate30 = promo.grantLicense30d > 0;

  if (!willActivate365 && !willActivate30) {
    throw httpError(400, "NO_CREDITS", "Dieser Gutscheincode enthält keine Lizenz-Credits.");
  }

  await prisma.$transaction(async (tx) => {
    await ensureEntitlement(tenantId);

    await tx.promoRedemption.create({
      data: {
        promoCodeId: promo.id,
        tenantId,
        redeemedAt: new Date(),
      },
      select: { promoCodeId: true },
    });

    const upd = await tx.promoCode.updateMany({
      where: { id: promo.id, redeemedCount: { lt: promo.maxRedemptions } },
      data: { redeemedCount: { increment: 1 } },
    });
    if (upd.count !== 1) throw httpError(400, "CODE_LIMIT_REACHED", "Dieser Gutscheincode wurde bereits verwendet.");

    const refId = promo.id;

    if (promo.grantLicense30d > 0) {
      await tx.tenantCreditBalance.upsert({
        where: { tenantId_type_expiresAt: { tenantId, type: "LICENSE_30D", expiresAt } },
        create: { tenantId, type: "LICENSE_30D", quantity: promo.grantLicense30d, expiresAt },
        update: { quantity: { increment: promo.grantLicense30d } },
      });
      await tx.tenantCreditLedger.create({
        data: { tenantId, type: "LICENSE_30D", delta: promo.grantLicense30d, reason: "COUPON_REDEEM", refId },
      });
    }

    if (promo.grantLicense365d > 0) {
      await tx.tenantCreditBalance.upsert({
        where: { tenantId_type_expiresAt: { tenantId, type: "LICENSE_365D", expiresAt } },
        create: { tenantId, type: "LICENSE_365D", quantity: promo.grantLicense365d, expiresAt },
        update: { quantity: { increment: promo.grantLicense365d } },
      });
      await tx.tenantCreditLedger.create({
        data: { tenantId, type: "LICENSE_365D", delta: promo.grantLicense365d, reason: "COUPON_REDEEM", refId },
      });
    }

    if (promo.grantDeviceSlots > 0) {
      await tx.tenantCreditBalance.upsert({
        where: { tenantId_type_expiresAt: { tenantId, type: "DEVICE_SLOT", expiresAt } },
        create: { tenantId, type: "DEVICE_SLOT", quantity: promo.grantDeviceSlots, expiresAt },
        update: { quantity: { increment: promo.grantDeviceSlots } },
      });
      await tx.tenantCreditLedger.create({
        data: { tenantId, type: "DEVICE_SLOT", delta: promo.grantDeviceSlots, reason: "COUPON_REDEEM", refId },
      });
    }

    // Auto-consume exactly 1 license credit of the granted license type (prefer 365)
    const action: ConsumeAction = willActivate365 ? "ACTIVATE_LICENSE_365D" : "ACTIVATE_LICENSE_30D";
    const consumeType: CreditType = willActivate365 ? "LICENSE_365D" : "LICENSE_30D";

    const picked = await pickBalanceToConsume(tenantId, consumeType);
    if (!picked.balance) {
      if (picked.expiredOnly) throw httpError(400, "CREDITS_EXPIRED", "Deine Credits sind abgelaufen.");
      throw httpError(400, "NO_CREDITS", "Keine Credits verfügbar.");
    }

    await tx.tenantCreditBalance.update({
      where: { id: picked.balance.id },
      data: { quantity: { decrement: 1 } },
      select: { id: true },
    });

    await tx.tenantCreditLedger.create({
      data: { tenantId, type: consumeType, delta: -1, reason: "CREDIT_CONSUME", refId },
      select: { id: true },
    });

    const now = new Date();
    const current = await tx.tenantEntitlement.findUnique({
      where: { tenantId },
      select: { validUntil: true },
    });

    const days = action === "ACTIVATE_LICENSE_365D" ? 365 : 30;
    const base = current?.validUntil && current.validUntil.getTime() > now.getTime() ? current.validUntil : now;
    const next = addDays(base, days);

    await tx.tenantEntitlement.update({
      where: { tenantId },
      data: { validUntil: next },
      select: { tenantId: true },
    });
  });

  return getMobileBillingStatus(tenantId);
}
