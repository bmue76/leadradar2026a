-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_eventId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "MobileDevice" DROP CONSTRAINT "MobileDevice_activeEventId_tenantId_fkey";

-- DropIndex
DROP INDEX "Event_id_tenantId_key";

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileDevice" ADD CONSTRAINT "MobileDevice_activeEventId_fkey" FOREIGN KEY ("activeEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
