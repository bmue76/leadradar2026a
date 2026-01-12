/*
  TP 3.5 — Lead Attachments
  Add new enum value BUSINESS_CARD_IMAGE to AttachmentType.

  IMPORTANT (Postgres):
  New enum values must be committed before they can be used.
  Therefore: this migration ONLY adds the value (no defaults, no updates).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'AttachmentType'
      AND e.enumlabel = 'BUSINESS_CARD_IMAGE'
  ) THEN
    ALTER TYPE "AttachmentType" ADD VALUE 'BUSINESS_CARD_IMAGE';
  END IF;
END $$;
