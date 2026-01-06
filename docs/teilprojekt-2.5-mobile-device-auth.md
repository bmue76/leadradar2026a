# Schlussrapport — Teilprojekt 2.5: Mobile Device Auth (ApiKey) + Rate Limit + Form Assignment

Datum: 2026-01-06  
Status: DONE ✅  
Commit(s): 6ed6056, 89108fd

## Ziel

Mobile API v1 produktionsnah absichern:

- Device Auth via ApiKey (`x-api-key`)
- Form Assignment pro Device (nur assigned ACTIVE forms)
- Rate Limiting (best-effort, Phase 1)
- Admin Management (Keys/Devices/Assignments) minimal

## Umsetzung (Highlights)

### DB (Prisma)
- Neue Models: MobileApiKey, MobileDevice, MobileDeviceForm
- ApiKey Speicherung: nur Hash (HMAC-SHA256) + prefix (indexiert)
- Konstante Vergleiche (timing-safe) im Auth
- Device ↔ ApiKey 1:1 (unique apiKeyId)
- Assignments tenant-scoped via composite key (tenantId, deviceId, formId)

### Mobile API v1 (protected)
- Alle /api/mobile/v1/* Endpoints require `x-api-key` (inkl. /health)
- GET /forms liefert nur assigned + ACTIVE
- GET /forms/:id und POST /leads prüfen assignment leak-safe (404)
- Rate limit best-effort in-memory (60 req/min pro ApiKey) → 429 RATE_LIMITED

### Admin API (tenant-scoped)
- Keys: create (cleartext once), list, revoke
- Devices: create, list inkl. assigned forms
- Assignments replace via PUT devices/:id/forms

### Admin UI (minimal)
- /admin/settings/devices: Keys + Devices + Assignment UI

## Dateien/Änderungen

- prisma/schema.prisma
- prisma/migrations/*_mobile_device_auth/
- prisma/seed.ts
- .env.example
- src/lib/mobileAuth.ts
- src/lib/rateLimit.ts
- src/app/api/mobile/v1/forms/route.ts
- src/app/api/mobile/v1/forms/[id]/route.ts
- src/app/api/mobile/v1/leads/route.ts
- src/app/api/mobile/v1/health/route.ts
- src/app/api/admin/v1/mobile/keys/route.ts
- src/app/api/admin/v1/mobile/keys/[id]/revoke/route.ts
- src/app/api/admin/v1/mobile/devices/route.ts
- src/app/api/admin/v1/mobile/devices/[id]/forms/route.ts
- src/app/api/admin/v1/forms/route.ts
- src/app/(admin)/admin/settings/devices/page.tsx
- src/app/(admin)/admin/settings/devices/DevicesClient.tsx
- docs/teilprojekt-2.5-mobile-device-auth.md

## Akzeptanzkriterien – Check

- [x] ApiKey auth via x-api-key (hash only + prefix)
- [x] Form assignment enforced (list/detail/lead create)
- [x] Rate limit best-effort -> 429 RATE_LIMITED
- [x] Admin Management minimal (Keys/Devices/Assignments)
- [x] Tenant-scope strikt + leak-safe 404
- [x] jsonOk/jsonError + traceId + x-trace-id
- [x] Validation via Zod (validateBody/validateQuery)

## Tests/Proof (reproduzierbar)

Quality Gates:
- npm run typecheck (0 errors)
- npm run lint (warnings ok)
- npm run build (grün)

Seed (DEV, local only):
- `MOBILE_API_KEY_SECRET` in `.env.local` gesetzt
- `npx prisma db seed` erzeugt demo + atlex ApiKey und loggt `x-api-key: <TOKEN>` einmalig in der Konsole

curl:
- missing key => 401
- valid key => 200 forms (assigned only)
- not assigned form => 404
- lead submit => 200 + leadId
- idempotent => deduped:true
- rate limit => 429 (best-effort loop)
- health endpoint protected => 401 ohne key / 200 mit key

## Offene Punkte/Risiken

P1:
- Rate limiting ist in-memory (Serverless/Multi-Instance nicht strikt) -> später Redis/Upstash.

## Next Step

- docs/LeadRadar2026A/03_API.md ergänzen (Mobile Auth + Admin Endpoints)
- docs/LeadRadar2026A/04_RUNBOOK.md ergänzen (MOBILE_API_KEY_SECRET + Rotation/Limitations)
- Optional: docs/LeadRadar2026A/05_RELEASE_TESTS.md Smoke Cases für Mobile Auth/Rate limit
