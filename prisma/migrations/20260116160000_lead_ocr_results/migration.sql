-- Migration reconstructed to resolve drift:
-- This migration is already applied in the DEV database but was missing locally.
-- It creates LeadOcrKind enum and LeadOcrResult table (TP 4.1 baseline).

-- CreateEnum
CREATE TYPE "LeadOcrKind" AS ENUM ('BUSINESS_CARD');

-- CreateTable
CREATE TABLE "LeadOcrResult" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  "kind" "LeadOcrKind" NOT NULL,
  "rawText" TEXT NOT NULL,
  "suggestions" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LeadOcrResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadOcrResult_tenantId_attachmentId_kind_key"
ON "LeadOcrResult"("tenantId", "attachmentId", "kind");

-- CreateIndex
CREATE INDEX "LeadOcrResult_tenantId_leadId_createdAt_idx"
ON "LeadOcrResult"("tenantId", "leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeadOcrResult"
ADD CONSTRAINT "LeadOcrResult_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOcrResult"
ADD CONSTRAINT "LeadOcrResult_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOcrResult"
ADD CONSTRAINT "LeadOcrResult_attachmentId_fkey"
FOREIGN KEY ("attachmentId") REFERENCES "LeadAttachment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
