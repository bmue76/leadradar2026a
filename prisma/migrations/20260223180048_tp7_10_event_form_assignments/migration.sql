-- CreateTable
CREATE TABLE "EventFormAssignment" (
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventFormAssignment_pkey" PRIMARY KEY ("tenantId","eventId","formId")
);

-- CreateIndex
CREATE INDEX "EventFormAssignment_tenantId_eventId_idx" ON "EventFormAssignment"("tenantId", "eventId");

-- CreateIndex
CREATE INDEX "EventFormAssignment_tenantId_formId_idx" ON "EventFormAssignment"("tenantId", "formId");

-- AddForeignKey
ALTER TABLE "EventFormAssignment" ADD CONSTRAINT "EventFormAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFormAssignment" ADD CONSTRAINT "EventFormAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFormAssignment" ADD CONSTRAINT "EventFormAssignment_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TP7.10 Backfill: legacy Form.assignedEventId -> EventFormAssignment
-- Only insert when Event exists in same tenant to avoid FK issues / tenant leaks.
INSERT INTO "EventFormAssignment" ("tenantId", "eventId", "formId", "createdAt")
SELECT f."tenantId", f."assignedEventId", f."id", CURRENT_TIMESTAMP
FROM "Form" f
JOIN "Event" e
  ON e."id" = f."assignedEventId"
 AND e."tenantId" = f."tenantId"
WHERE f."assignedEventId" IS NOT NULL
ON CONFLICT DO NOTHING;
