-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "capturedByDeviceId" TEXT,
ADD COLUMN     "hasNotes" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isQualified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Lead_tenantId_eventId_isQualified_capturedAt_idx" ON "Lead"("tenantId", "eventId", "isQualified", "capturedAt");

-- CreateIndex
CREATE INDEX "Lead_tenantId_eventId_capturedByDeviceId_capturedAt_idx" ON "Lead"("tenantId", "eventId", "capturedByDeviceId", "capturedAt");
