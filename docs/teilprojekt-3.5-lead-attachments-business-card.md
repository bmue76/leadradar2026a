# Schlussrapport — Teilprojekt 3.5: Lead Attachments (Business Card Image) — DONE ✅

Datum: 2026-01-12

## Ziel
- Mobile kann zu einem Lead eine Visitenkarte als Bild hochladen (MVP: local storage).
- Admin kann Attachments im Lead-Detail sehen (Thumbnail bei Bildern) und downloaden (inline/attachment).
- DB erweitert um AttachmentType `BUSINESS_CARD_IMAGE`.
- Migrations sind reset/shadow-safe.

## Umsetzung (Highlights)
- DB:
  - Enum `AttachmentType` um `BUSINESS_CARD_IMAGE` erweitert.
  - LeadAttachment bleibt tenant-scoped und leak-safe.
- Mobile API:
  - `POST /api/mobile/v1/leads/:id/attachments` (multipart/form-data)
  - Validierung: size limit + mime allowlist (jpeg/png/webp) + type mapping
  - StorageKey: `${tenantId}/${leadId}/${attachmentId}.${ext}` (MVP in .tmp_attachments)
- Admin API:
  - `GET /api/admin/v1/leads/:id` liefert attachments im Detail.
  - `GET /api/admin/v1/leads/:id/attachments/:attachmentId/download`
    - `?disposition=inline|attachment`
    - leak-safe checks: tenant + lead + attachment + storageKey + file exists
- Admin UI:
  - Lead Detail zeigt Attachments inkl. Thumbnail (Image) + Download-Link.

## Proof (CURLs)
Siehe Runbook-Snippet im Masterchat:
- provision/claim -> mobile forms -> create lead -> upload attachment -> admin download

## Quality Gates
- `npx prisma migrate reset --force` ✅
- `npm run db:seed` ✅
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run build` ✅
