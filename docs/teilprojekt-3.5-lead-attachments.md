# Schlussrapport — Teilprojekt 3.5: Lead Attachments (Upload + Download + Admin UI) — ONLINE-only (MVP)

Status: ✅ IMPLEMENTIERT (Code) / ⛳ Docs-Integration in Master-Dokumente folgt als separater Schritt
Datum: 2026-01-11
Commits (main):
- TODO

## Ziel

Visitenkarten-Fotos als Attachments an Leads speichern und im Admin anzeigen + downloaden.
Kein OCR (Phase 2). Phase 1: reine Dateiablage + Referenzierung + leak-safe Zugriff.

## Umsetzung (Highlights)

- DB: AttachmentType um `BUSINESS_CARD_IMAGE` erweitert, Default gesetzt.
- Mobile API: `POST /api/mobile/v1/leads/:id/attachments` (multipart upload).
  - Limits: 6MB, allowlist image/jpeg|png|webp
  - Leak-safe: Lead nicht im Tenant → 404
  - Speicherung DEV lokal unter `.tmp_attachments/<tenantId>/<leadId>/<attachmentId>.<ext>`
- Admin API: `GET /api/admin/v1/leads/:id/attachments/:attachmentId/download`
  - Leak-safe 404 bei mismatch
  - `?inline=1` für Bild-Preview (Content-Disposition: inline)
  - Auth: Cookie-Session (UI) oder x-tenant-slug (curl proof, DEV)
- Admin UI: Lead Drawer zeigt Attachments, Business-Card Bild als Thumbnail + Download-Link.

## Dateien/Änderungen

- prisma/schema.prisma
- prisma/migrations/20260111210000_lead_attachments_business_card_type/migration.sql
- src/app/api/mobile/v1/leads/[id]/attachments/route.ts
- src/app/api/admin/v1/leads/[id]/attachments/[attachmentId]/download/route.ts
- src/app/(admin)/admin/leads/LeadDetailDrawer.tsx
- docs/teilprojekt-3.5-lead-attachments.md

## Akzeptanzkriterien – Check

- ✅ Mobile: Attachment Upload speichert Datei + DB Record
- ✅ Admin: Drawer zeigt Attachment + Download funktioniert
- ✅ Tenant-scope + leak-safe 404 überall
- ✅ max size + mime allowlist enforced
- ✅ Inline Preview via `?inline=1` (nur image/*)
- ⛳ DoD: Docs-Integration in 02_DB.md / 03_API.md / 04_ADMIN_UI.md separat, sobald Files geliefert

## Tests/Proof (reproduzierbar)

Setup:
- prisma migrate dev
- npm run db:seed
- npm run dev

1) Lead erzeugen:
- Mobile App Lead senden oder /admin/demo/capture
- Lead ID kopieren

2) Upload via curl (Mobile API):
curl -i \
  -H "x-api-key: <MOBILE_API_KEY>" \
  -F "file=@/path/to/card.jpg" \
  -F "type=BUSINESS_CARD_IMAGE" \
  "http://localhost:3000/api/mobile/v1/leads/<LEAD_ID>/attachments"

3) Admin Download via curl (DEV, x-tenant-slug):
curl -i -H "x-tenant-slug: atlex" \
  "http://localhost:3000/api/admin/v1/leads/<LEAD_ID>/attachments/<ATTACHMENT_ID>/download"

4) UI:
- /admin/leads → Drawer öffnen → Thumbnail sichtbar + Download klickbar

## Offene Punkte / Risiken

P1:
- Master Docs (02_DB.md / 03_API.md / 04_ADMIN_UI.md) müssen noch konsolidiert ergänzt werden (nur Integration, keine Logik).

## Next Step

- Docs-Integration finalisieren + Schlussrapport-Commit + Push
