/*
  TP 3.5 — Lead Attachments
  Postgres: neue Enum-Werte dürfen in derselben Transaktion nicht sofort verwendet werden.
  => Diese Migration fügt NUR den Enum-Wert hinzu. Keine Updates/Defaults hier.
*/

ALTER TYPE "AttachmentType" ADD VALUE IF NOT EXISTS 'BUSINESS_CARD_IMAGE';
