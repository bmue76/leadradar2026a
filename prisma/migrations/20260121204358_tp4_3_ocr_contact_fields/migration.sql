/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,attachmentId,mode]` on the table `LeadOcrResult` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "LeadOcrMode" AS ENUM ('ON_DEVICE_LATIN', 'SERVER_FALLBACK');

-- CreateEnum
CREATE TYPE "LeadOcrStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "LeadOcrEngine" AS ENUM ('MLKIT', 'SERVER_PLACEHOLDER');

-- CreateEnum
CREATE TYPE "LeadContactSource" AS ENUM ('MANUAL', 'OCR_MOBILE', 'OCR_ADMIN');

-- DropIndex
DROP INDEX "LeadOcrResult_tenantId_attachmentId_kind_key";

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "contactCity" TEXT,
ADD COLUMN     "contactCompany" TEXT,
ADD COLUMN     "contactCountry" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactFirstName" TEXT,
ADD COLUMN     "contactLastName" TEXT,
ADD COLUMN     "contactMobile" TEXT,
ADD COLUMN     "contactOcrResultId" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "contactSource" "LeadContactSource",
ADD COLUMN     "contactStreet" TEXT,
ADD COLUMN     "contactTitle" TEXT,
ADD COLUMN     "contactUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "contactWebsite" TEXT,
ADD COLUMN     "contactZip" TEXT;

-- AlterTable
ALTER TABLE "LeadOcrResult" ADD COLUMN     "blocksJson" JSONB,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "correctedAt" TIMESTAMP(3),
ADD COLUMN     "correctedByUserId" TEXT,
ADD COLUMN     "correctedContactJson" JSONB,
ADD COLUMN     "engine" "LeadOcrEngine" NOT NULL DEFAULT 'MLKIT',
ADD COLUMN     "engineVersion" TEXT,
ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "languageHint" TEXT,
ADD COLUMN     "mode" "LeadOcrMode" NOT NULL DEFAULT 'ON_DEVICE_LATIN',
ADD COLUMN     "resultHash" TEXT,
ADD COLUMN     "status" "LeadOcrStatus" NOT NULL DEFAULT 'COMPLETED',
ALTER COLUMN "rawText" DROP NOT NULL,
ALTER COLUMN "suggestions" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Lead_tenantId_contactEmail_idx" ON "Lead"("tenantId", "contactEmail");

-- CreateIndex
CREATE INDEX "Lead_tenantId_contactCompany_idx" ON "Lead"("tenantId", "contactCompany");

-- CreateIndex
CREATE INDEX "LeadOcrResult_tenantId_status_updatedAt_idx" ON "LeadOcrResult"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "LeadOcrResult_tenantId_attachmentId_mode_idx" ON "LeadOcrResult"("tenantId", "attachmentId", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "LeadOcrResult_tenantId_attachmentId_mode_key" ON "LeadOcrResult"("tenantId", "attachmentId", "mode");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_contactOcrResultId_fkey" FOREIGN KEY ("contactOcrResultId") REFERENCES "LeadOcrResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOcrResult" ADD CONSTRAINT "LeadOcrResult_correctedByUserId_fkey" FOREIGN KEY ("correctedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
