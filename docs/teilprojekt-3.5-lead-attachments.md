# Teilprojekt 3.5 — Lead Attachments (Upload + Download + Admin UI + Mobile) — ONLINE-only (MVP)

Status: IN ARBEIT  
Datum: 2026-01-11

## Ziel

Visitenkarten-Fotos als Attachments an Leads speichern und im Admin anzeigen/downloaden.

Phase 1 (ONLINE-only):
- reine Dateiablage + DB Referenzierung
- leak-safe tenant-scope überall
- **kein OCR** (Phase 2)

## Scope

- DB: `LeadAttachment` + `AttachmentType` (MVP: `BUSINESS_CARD_IMAGE`)
- Mobile API: Upload via `multipart/form-data`
- Admin API: Download + optional inline Preview (`?inline=1`) für `image/*`
- Admin UI: Lead Drawer zeigt Attachments inkl. Thumbnail + Download
- Storage: DEV stub `.tmp_attachments/` (sicherer relativeKey; no public serving)

## Umsetzung (Highlights)

- StorageKey Konvention:
  - `.tmp_attachments/<tenantId>/<leadId>/<attachmentId>.<ext>`
- Security:
  - tenantId-scoped Lookups (`Lead` und `LeadAttachment`)
  - mismatch → 404 NOT_FOUND (leak-safe)
  - path traversal prevention über safe relative key validation
- Upload constraints:
  - max 6MB
  - mime allowlist: jpeg/png/webp

## API Contracts

### Mobile Upload

`POST /api/mobile/v1/leads/:id/attachments`

- Auth: `x-api-key`
- Body: multipart/form-data
  - `file` (required)
  - `type` (optional, default `BUSINESS_CARD_IMAGE`)
- Errors: 401, 404, 413, 415, 429

### Admin Download

`GET /api/admin/v1/leads/:id/attachments/:attachmentId/download`

- Auth:
  - Browser: Session cookie
  - Tools (DEV): `x-tenant-slug`
- Optional: `?inline=1` (nur image/*)
- Errors: 401, 404, 500

## UX Notes (Admin)

- Lead Detail Drawer:
  - Attachments Section
  - Für BUSINESS_CARD_IMAGE & image/*: Preview/Thumbnail + Download
  - Empty: “No attachments.”

## Tests / Proof (reproduzierbar)

1) Migrations + Build:
- `npm run typecheck`
- `npm run lint`
- `npm run build`

2) Seed + Dev:
- `npm run db:seed`
- `npm run dev`

3) Upload (curl):
```bash
curl -i \
  -H "x-api-key: <MOBILE_API_KEY>" \
  -F "file=@/path/to/card.jpg" \
  -F "type=BUSINESS_CARD_IMAGE" \
  "http://localhost:3000/api/mobile/v1/leads/<LEAD_ID>/attachments"
Download (curl, DEV tenant):

bash
Code kopieren
curl -i -H "x-tenant-slug: atlex" \
  "http://localhost:3000/api/admin/v1/leads/<LEAD_ID>/attachments/<ATTACHMENT_ID>/download"
UI:

/admin/leads → Drawer öffnen → Attachment sichtbar + Download klickbar

Offene Punkte / Risiken
Phase 2: Offline Outbox/Sync + OCR Pipeline (nicht Teil dieses Teilprojekts)

Object Storage (S3/R2) Swap-in: storage helper bleibt API-konform, rootDir wird ersetzt

Next Step
Schlussrapport finalisieren (Commits + Hashes)

Release Tests (Smoke) aktualisieren, falls nötig
