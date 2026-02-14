-- CreateTable
CREATE TABLE "FormPreset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "imageUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FormPreset_tenantId_createdAt_idx" ON "FormPreset"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "FormPreset_tenantId_updatedAt_idx" ON "FormPreset"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "FormPreset_tenantId_name_idx" ON "FormPreset"("tenantId", "name");

-- CreateIndex
CREATE INDEX "FormPreset_tenantId_category_createdAt_idx" ON "FormPreset"("tenantId", "category", "createdAt");

-- CreateIndex
CREATE INDEX "FormPreset_isPublic_createdAt_idx" ON "FormPreset"("isPublic", "createdAt");

-- CreateIndex
CREATE INDEX "FormPreset_isPublic_name_idx" ON "FormPreset"("isPublic", "name");

-- AddForeignKey
ALTER TABLE "FormPreset" ADD CONSTRAINT "FormPreset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
