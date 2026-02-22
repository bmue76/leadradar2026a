-- AlterTable
ALTER TABLE "MobileProvisionToken" ADD COLUMN     "deviceId" TEXT;

-- CreateIndex
CREATE INDEX "MobileProvisionToken_tenantId_deviceId_status_expiresAt_idx" ON "MobileProvisionToken"("tenantId", "deviceId", "status", "expiresAt");

-- AddForeignKey
ALTER TABLE "MobileProvisionToken" ADD CONSTRAINT "MobileProvisionToken_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "MobileDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
