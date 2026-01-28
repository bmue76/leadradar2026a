-- CreateTable
CREATE TABLE "FormTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormTemplate_tenantId_createdAt_idx" ON "FormTemplate"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "FormTemplate_tenantId_name_idx" ON "FormTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "FormTemplate_tenantId_category_createdAt_idx" ON "FormTemplate"("tenantId", "category", "createdAt");

-- AddForeignKey
ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
