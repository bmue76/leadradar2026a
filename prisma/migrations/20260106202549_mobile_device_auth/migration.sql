-- CreateEnum
CREATE TYPE "MobileApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "MobileDeviceStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "MobileApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "status" "MobileApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,

    CONSTRAINT "MobileApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "status" "MobileDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MobileDeviceForm" (
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileDeviceForm_pkey" PRIMARY KEY ("tenantId","deviceId","formId")
);

-- CreateIndex
CREATE INDEX "MobileApiKey_tenantId_status_createdAt_idx" ON "MobileApiKey"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MobileApiKey_prefix_status_idx" ON "MobileApiKey"("prefix", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MobileDevice_apiKeyId_key" ON "MobileDevice"("apiKeyId");

-- CreateIndex
CREATE INDEX "MobileDevice_tenantId_status_createdAt_idx" ON "MobileDevice"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MobileDevice_tenantId_apiKeyId_idx" ON "MobileDevice"("tenantId", "apiKeyId");

-- CreateIndex
CREATE INDEX "MobileDeviceForm_tenantId_deviceId_idx" ON "MobileDeviceForm"("tenantId", "deviceId");

-- CreateIndex
CREATE INDEX "MobileDeviceForm_tenantId_formId_idx" ON "MobileDeviceForm"("tenantId", "formId");

-- AddForeignKey
ALTER TABLE "MobileApiKey" ADD CONSTRAINT "MobileApiKey_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileApiKey" ADD CONSTRAINT "MobileApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileDevice" ADD CONSTRAINT "MobileDevice_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "MobileApiKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileDevice" ADD CONSTRAINT "MobileDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileDeviceForm" ADD CONSTRAINT "MobileDeviceForm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileDeviceForm" ADD CONSTRAINT "MobileDeviceForm_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MobileDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileDeviceForm" ADD CONSTRAINT "MobileDeviceForm_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
