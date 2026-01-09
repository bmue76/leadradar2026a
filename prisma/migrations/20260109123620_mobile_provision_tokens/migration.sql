-- CreateEnum
CREATE TYPE "MobileProvisionTokenStatus" AS ENUM ('ACTIVE', 'REVOKED', 'USED');

-- CreateTable
CREATE TABLE "MobileProvisionToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "MobileProvisionTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByDeviceId" TEXT,
    "requestedDeviceName" TEXT,
    "requestedFormIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "MobileProvisionToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobileProvisionToken_tokenHash_key" ON "MobileProvisionToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MobileProvisionToken_tenantId_status_expiresAt_idx" ON "MobileProvisionToken"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "MobileProvisionToken_tenantId_createdAt_idx" ON "MobileProvisionToken"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "MobileProvisionToken_prefix_status_idx" ON "MobileProvisionToken"("prefix", "status");

-- AddForeignKey
ALTER TABLE "MobileProvisionToken" ADD CONSTRAINT "MobileProvisionToken_usedByDeviceId_fkey" FOREIGN KEY ("usedByDeviceId") REFERENCES "MobileDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileProvisionToken" ADD CONSTRAINT "MobileProvisionToken_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileProvisionToken" ADD CONSTRAINT "MobileProvisionToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
