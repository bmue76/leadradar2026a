# Teilprojekt 2.5 — Mobile Device Auth (ApiKey) + Rate Limit + Form Assignment

Status: DONE ✅  
Datum: 2026-01-06  
Commit(s):
- 6ed6056
- 89108fd
- 7bac55d
- 565a198

---

## Ziel

Mobile API v1 produktionsnah absichern:

- Device Auth via ApiKey (`x-api-key`)
- Form Assignment pro Device (nur assigned ACTIVE forms)
- Rate Limiting (best-effort, Phase 1)
- Admin Management (Keys/Devices/Assignments) minimal und tenant-scoped

---

## Umsetzung (Highlights)

### DB / Prisma
- Neue Modelle: `MobileApiKey`, `MobileDevice`, `MobileDeviceForm`
- Indizes/Constraints für Tenant-Scoping + Assignments
- ApiKey Speicherung: **nur HMAC-SHA256 Hash + prefix**
- Klartext-Key: **nur einmalig** bei Create/Seed (DEV)

### Mobile API v1
- Alle Endpoints unter `/api/mobile/v1/*` geschützt (ApiKey Required)
- Assignment Enforcement:
  - Forms List/Detail nur für zugewiesene Forms
  - Lead Create nur wenn Form assigned
  - Leak-safe: unassigned/fremde IDs → 404 `NOT_FOUND`
- Rate Limit: **60 req/min** best-effort pro ApiKey → 429 `RATE_LIMITED`
- Health Endpoint nachgezogen und geschützt

### Admin API + UI
- Minimaler Admin-Flow:
  - Keys erstellen + revoke
  - Device anlegen
  - Form Assignments via Replace-Strategy
- Tenant-scoped, leak-safe wie im Backend-Standard

### Docs
- `03_API.md` und `04_RUNBOOK.md` auf TP-2.5-Stand aktualisiert
- Env/Rotation/Limitations dokumentiert (inkl. In-Memory RateLimit Caveat)

---

## Dateien/Änderungen (Kern)

- Prisma:
  - `prisma/schema.prisma`
  - `prisma/migrations/*_mobile_device_auth/`
  - `prisma/seed.ts`
- Env:
  - `.env.example` (ohne Secrets)
- Libs:
  - `src/lib/mobileAuth.ts`
  - `src/lib/rateLimit.ts`
- Mobile API:
  - `/api/mobile/v1/forms` (list)
  - `/api/mobile/v1/forms/[id]` (detail)
  - `/api/mobile/v1/leads` (create idempotent + assignment check)
  - `/api/mobile/v1/health` (protected)
- Admin API:
  - mobile keys/devices + assignments
  - admin forms response kompatibilisiert (items alias)
- Admin UI:
  - `/admin/settings/devices/*`
- Docs:
  - `docs/teilprojekt-2.5-mobile-device-auth.md`
  - `docs/LeadRadar2026A/03_API.md`
  - `docs/LeadRadar2026A/04_RUNBOOK.md`

---

## Akzeptanzkriterien — Check

- ✅ ApiKey Auth via `x-api-key` (hash only + prefix)
- ✅ Assignment Enforcement (list/detail/lead create) + leak-safe 404
- ✅ Rate Limit best-effort → 429 `RATE_LIMITED`
- ✅ Admin Management minimal (Keys/Devices/Assignments)
- ✅ API Standards (`jsonOk/jsonError` + `traceId` + `x-trace-id`)
- ✅ Zod Validation (`validateBody/validateQuery`)
- ✅ DoD: typecheck/lint/build grün, docs updated, pushed, git clean

---

## Tests / Proof (reproduzierbar)

- `npm run typecheck` ✅
- `npm run lint` ✅ (Warnings ok)
- `npm run build` ✅
- Seed erzeugt demo/atlex `x-api-key` Tokens (nur Dev Output)
- curl Proof:
  - 401 ohne key
  - 200 mit key
  - 404 unassigned form (leak-safe)
  - idempotent deduped
  - 429 via loop
  - health endpoint geschützt

---

## Offene Punkte / Risiken (P1)

- P1: Rate Limit ist in-memory (serverless/multi-instance nicht strikt) → Upgrade-Pfad Redis/Upstash dokumentiert.

---

## Next Step

➡️ TP 2.6 (Optionen, je nach Priorität):
- Mobile “Device Heartbeat/lastSeen” + Diagnostics (operational)
- Key Rotation Endpoint (Admin)
- Event/QR Flow (Form Assignment via QR/Event) für Messe-Realität
- Offline-Outbox Architektur vorbereiten (nur Design/Docs, keine Implementierung)
