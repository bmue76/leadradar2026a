-- Reconstructed missing migration: 20260219150926_tp7_5_email_audit_log
-- Source: prisma migrate diff --from-empty --to-config-datasource
-- STRICT: AdminEmailLog statements only (shadow-db safe)

-- CreateTable
CREATE TABLE "public"."AdminEmailLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT,
    "includePdf" BOOLEAN NOT NULL DEFAULT false,
    "attachmentsSentCount" INTEGER NOT NULL DEFAULT 0,
    "attachmentsSkippedCount" INTEGER NOT NULL DEFAULT 0,
    "attachmentsSentBytes" INTEGER NOT NULL DEFAULT 0,
    "attachmentsSkippedBytes" INTEGER NOT NULL DEFAULT 0,
    "mode" TEXT NOT NULL,
    "delivered" BOOLEAN NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "AdminEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminEmailLog_leadId_idx" ON "public"."AdminEmailLog"("leadId" ASC);

-- CreateIndex
CREATE INDEX "AdminEmailLog_tenantId_createdAt_idx" ON "public"."AdminEmailLog"("tenantId" ASC, "createdAt" ASC);
