-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "logoHeight" INTEGER,
ADD COLUMN     "logoKey" TEXT,
ADD COLUMN     "logoMime" TEXT,
ADD COLUMN     "logoOriginalName" TEXT,
ADD COLUMN     "logoSizeBytes" INTEGER,
ADD COLUMN     "logoUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "logoWidth" INTEGER;
