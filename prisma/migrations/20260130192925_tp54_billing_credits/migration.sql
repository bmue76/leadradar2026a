-- CreateEnum
CREATE TYPE "TenantCreditType" AS ENUM ('LICENSE_30D', 'LICENSE_365D', 'DEVICE_SLOT');

-- CreateEnum
CREATE TYPE "TenantCreditLedgerReason" AS ENUM ('COUPON_REDEEM', 'CREDIT_CONSUME', 'MANUAL_ADJUST');

-- CreateTable
CREATE TABLE "TenantEntitlement" (
    "tenantId" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3),
    "maxDevices" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantEntitlement_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "TenantCreditBalance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "TenantCreditType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantCreditBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantCreditLedger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "TenantCreditType" NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "TenantCreditLedgerReason" NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantCreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "maxRedemptions" INTEGER NOT NULL DEFAULT 1,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "grantLicense30d" INTEGER NOT NULL DEFAULT 0,
    "grantLicense365d" INTEGER NOT NULL DEFAULT 0,
    "grantDeviceSlots" INTEGER NOT NULL DEFAULT 0,
    "creditExpiresInDays" INTEGER NOT NULL DEFAULT 365,
    "partner" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoRedemption" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedByUserId" TEXT,

    CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantCreditBalance_tenantId_type_expiresAt_idx" ON "TenantCreditBalance"("tenantId", "type", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantCreditBalance_tenantId_type_expiresAt_key" ON "TenantCreditBalance"("tenantId", "type", "expiresAt");

-- CreateIndex
CREATE INDEX "TenantCreditLedger_tenantId_createdAt_idx" ON "TenantCreditLedger"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantCreditLedger_tenantId_type_createdAt_idx" ON "TenantCreditLedger"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoRedemption_tenantId_redeemedAt_idx" ON "PromoRedemption"("tenantId", "redeemedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoRedemption_promoCodeId_tenantId_key" ON "PromoRedemption"("promoCodeId", "tenantId");

-- AddForeignKey
ALTER TABLE "TenantEntitlement" ADD CONSTRAINT "TenantEntitlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantCreditBalance" ADD CONSTRAINT "TenantCreditBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantCreditLedger" ADD CONSTRAINT "TenantCreditLedger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
