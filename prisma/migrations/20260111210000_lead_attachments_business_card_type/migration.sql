-- TP 3.5 — Lead Attachments MVP
-- Add enum value BUSINESS_CARD_IMAGE and set default on LeadAttachment.type.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AttachmentType'
      AND e.enumlabel = 'BUSINESS_CARD_IMAGE'
  ) THEN
    ALTER TYPE "AttachmentType" ADD VALUE 'BUSINESS_CARD_IMAGE';
  END IF;
END $$;

ALTER TABLE "LeadAttachment"
  ALTER COLUMN "type" SET DEFAULT 'BUSINESS_CARD_IMAGE';
