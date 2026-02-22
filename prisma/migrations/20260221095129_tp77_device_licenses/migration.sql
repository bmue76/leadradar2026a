-- CreateEnum
CREATE TYPE "DeviceLicenseType" AS ENUM ('FAIR_30D', 'YEAR_365D');

-- CreateEnum
CREATE TYPE "DeviceLicenseStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "DeviceLicense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" "DeviceLicenseType" NOT NULL,
    "status" "DeviceLicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "currency" TEXT,
    "amountCents" INTEGER,
    "createdByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceLicense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceLicense_stripeCheckoutSessionId_key" ON "DeviceLicense"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "DeviceLicense_tenantId_deviceId_idx" ON "DeviceLicense"("tenantId", "deviceId");

-- CreateIndex
CREATE INDEX "DeviceLicense_tenantId_deviceId_endsAt_idx" ON "DeviceLicense"("tenantId", "deviceId", "endsAt");

-- CreateIndex
CREATE INDEX "DeviceLicense_tenantId_endsAt_idx" ON "DeviceLicense"("tenantId", "endsAt");

-- CreateIndex
CREATE INDEX "DeviceLicense_endsAt_idx" ON "DeviceLicense"("endsAt");

-- AddForeignKey
ALTER TABLE "DeviceLicense" ADD CONSTRAINT "DeviceLicense_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceLicense" ADD CONSTRAINT "DeviceLicense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceLicense" ADD CONSTRAINT "DeviceLicense_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MobileDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
