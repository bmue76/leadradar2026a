/*
  TP 3.3 — Events (Messen) — Core
  Ziel: clean apply auf leerer DB (reset/shadow) + robust gegen "already exists".
*/

-- 1) Enum: EventStatus (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventStatus') THEN
    CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
  END IF;
END $$;

-- 2) Tabelle: Event
CREATE TABLE IF NOT EXISTS "Event" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "location" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- FK: Event.tenantId -> Tenant.id (idempotent)
DO $$
BEGIN
  IF to_regclass('"Event"') IS NOT NULL AND to_regclass('"Tenant"') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Event_tenantId_fkey') THEN
      ALTER TABLE "Event"
        ADD CONSTRAINT "Event_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

-- 3) Lead.eventId + FK -> Event.id
ALTER TABLE IF EXISTS "Lead" ADD COLUMN IF NOT EXISTS "eventId" TEXT;

DO $$
BEGIN
  IF to_regclass('"Lead"') IS NOT NULL AND to_regclass('"Event"') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lead_eventId_fkey') THEN
      ALTER TABLE "Lead"
        ADD CONSTRAINT "Lead_eventId_fkey"
        FOREIGN KEY ("eventId") REFERENCES "Event"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

-- 4) MobileDevice.activeEventId + FK -> Event.id
ALTER TABLE IF EXISTS "MobileDevice" ADD COLUMN IF NOT EXISTS "activeEventId" TEXT;

DO $$
BEGIN
  IF to_regclass('"MobileDevice"') IS NOT NULL AND to_regclass('"Event"') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MobileDevice_activeEventId_fkey') THEN
      ALTER TABLE "MobileDevice"
        ADD CONSTRAINT "MobileDevice_activeEventId_fkey"
        FOREIGN KEY ("activeEventId") REFERENCES "Event"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;

-- 5) Indizes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS "Event_tenantId_status_idx" ON "Event"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Event_tenantId_startsAt_idx" ON "Event"("tenantId", "startsAt");

CREATE INDEX IF NOT EXISTS "Lead_tenantId_eventId_capturedAt_idx" ON "Lead"("tenantId", "eventId", "capturedAt");
CREATE INDEX IF NOT EXISTS "MobileDevice_tenantId_activeEventId_idx" ON "MobileDevice"("tenantId", "activeEventId");
