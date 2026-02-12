/*
  TP 6.10 — Multi-ACTIVE Events (Tenant)
  -------------------------------------
  Previously, the DB had a partial UNIQUE index enforcing:
    "max 1 ACTIVE event per tenant"

  We now allow multiple ACTIVE events per tenant.
  The capture context is per device (MobileDevice.activeEventId) and per UI selection (eventId query param).

  The exact index name can differ across environments, so we drop it dynamically.
*/

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, indexname
    FROM pg_indexes
    WHERE (tablename = 'Event' OR tablename = 'event')
      AND indexdef ILIKE '%unique%'
      AND indexdef ILIKE '%tenantid%'
      AND indexdef ILIKE '%status%'
      AND indexdef ILIKE '%where%'
      AND indexdef ILIKE '%active%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I.%I', r.schemaname, r.indexname);
  END LOOP;
END $$;
