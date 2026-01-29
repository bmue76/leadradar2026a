-- TP 5.1 — Option 2 Form Assignment + Active Event Guardrail (Postgres)

-- 1) Form.assignedEventId
ALTER TABLE "Form" ADD COLUMN IF NOT EXISTS "assignedEventId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Form_assignedEventId_fkey'
  ) THEN
    ALTER TABLE "Form"
      ADD CONSTRAINT "Form_assignedEventId_fkey"
      FOREIGN KEY ("assignedEventId")
      REFERENCES "Event"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END$$;

-- 2) Indexes for Option 2 checks
CREATE INDEX IF NOT EXISTS "Form_tenantId_assignedEventId_idx"
  ON "Form" ("tenantId", "assignedEventId");

CREATE INDEX IF NOT EXISTS "Form_tenantId_status_assignedEventId_idx"
  ON "Form" ("tenantId", "status", "assignedEventId");

-- 3) Guardrail: max 1 ACTIVE event per tenant (partial unique index)
-- NOTE: will fail if existing data has multiple ACTIVE events per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS "Event_tenantId_active_unique"
  ON "Event" ("tenantId")
  WHERE ("status" = 'ACTIVE');
