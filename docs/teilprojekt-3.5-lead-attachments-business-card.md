# Schlussrapport — Teilprojekt 3.5: Lead Attachments (Business Card Image) — DONE ✅

Datum: 2026-01-12

## Ziel
- Mobile: Upload von Attachments (MVP: BUSINESS_CARD_IMAGE als WebP/JPG/PNG) zu einem Lead.
- Admin: Attachments im Lead-Detail anzeigen (Thumbnail inline) + Download (attachment).
- Leak-safe: tenant-scoped auf Lead + Attachment.
- Storage (MVP): local `.tmp_attachments` via storageKey.

## Umsetzung (Highlights)
- DB
  - Enum `AttachmentType` um `BUSINESS_CARD_IMAGE` erweitert.
  - Migration reset/shadow-safe (kein “unsafe enum use” mehr).
- Mobile API
  - `POST /api/mobile/v1/leads/:id/attachments` (multipart/form-data)
  - Allowlist MIME: image/jpeg, image/png, image/webp
  - Size limit: 6MB
  - `type` default: BUSINESS_CARD_IMAGE
- Admin API
  - Lead-Detail liefert `attachments[]`
  - Download endpoint:
    - `GET /api/admin/v1/leads/:id/attachments/:attachmentId/download`
    - `?disposition=inline|attachment`
- Admin UI
  - Lead Detail Drawer zeigt Attachments inkl. Thumbnail + Download.

## Proof (E2E)
- Provision Claim -> x-api-key erhalten
- Forms -> FORM_ID
- Lead Create -> LEAD_ID
- Attachment Upload (Git Bash + cygpath -m + type=image/webp)
- Admin Download inline/attachment erfolgreich (200)
