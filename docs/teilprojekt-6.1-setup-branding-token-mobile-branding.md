# Schlussrapport — Teilprojekt 6.1: Branding Token (accentColor) + Mobile Branding (read-only)

Status: DONE ✅  
Datum: 2026-02-03  
Branch: main  
Commit(s):
- ace36d1 — feat(tp6.1): admin accent token + mobile branding
- a7fba2c — docs(tp6.1): schlussrapport + index

## Ziel

- Admin: accentColor als zentraler UI-Token (CSS var), damit Branding konsistent angewendet werden kann.
- Mobile: read-only Branding Endpoint (Name, AccentColor, Logo-URL) + Logo Binary Endpoint für App-Header/Startscreen.
- Leak-safe tenant scope, Standards jsonOk/jsonError + traceId (für JSON) sowie x-trace-id Header bei Binary.

## Umsetzung (Highlights)

### Admin UI Token
- Neuer Client Provider setzt CSS-Variablen:
  - --lr-accent (Primary Token)
  - --lr-accent-soft (für subtile Varianten)
- AdminShell hängt Provider ein und nutzt Token dezent (Accent-Dot neben Titel).
- Refresh via Event „lr_tenant_branding_updated“.

### Mobile API
- GET /api/mobile/v1/branding
  - tenant-scoped via requireMobileAuth
  - liefert { tenant.slug, branding: { name, legalName, displayName, accentColor, hasLogo, logoUrl, logoUpdatedAt, logoMime } }
- GET/HEAD /api/mobile/v1/branding/logo
  - liefert Logo Binary (private cache + ETag)
  - leak-safe device/tenant check
  - x-trace-id Header auch bei Binary Antworten

## Dateien/Änderungen

- src/app/(admin)/admin/_components/AdminAccentProvider.tsx (neu)
- src/app/(admin)/admin/_components/AdminShell.tsx (updated: provider + accent dot)
- src/app/api/mobile/v1/branding/route.ts (neu)
- src/app/api/mobile/v1/branding/logo/route.ts (neu)
- docs/teilprojekt-6.1-setup-branding-token-mobile-branding.md (neu)
- docs/LeadRadar2026A/00_INDEX.md (updated)

## Akzeptanzkriterien – Check ✅

- ✅ Admin: Accent Token gesetzt und nach Branding-Update automatisch refreshed
- ✅ Mobile: Branding JSON Endpoint liefert Name/Accent/Logo-Info tenant-scoped
- ✅ Mobile: Logo Endpoint streamt Binary, ETag/Cache gesetzt
- ✅ Leak-safe: falscher Scope → 404 NOT_FOUND
- ✅ DoD: typecheck/lint/build grün

## Tests/Proof (reproduzierbar)

### Commands
```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build
API Proof
(gleicher Auth-Header wie /api/mobile/v1/events/active)

curl -i -H "X-API-KEY: DEIN_DEVICE_KEY" "http://localhost:3000/api/mobile/v1/branding"
curl -i -H "X-API-KEY: DEIN_DEVICE_KEY" "http://localhost:3000/api/mobile/v1/branding/logo"
UI Smoke
/admin/branding AccentColor setzen → Speichern → Topbar Accent-Dot aktualisiert

Offene Punkte / Risiken
P1: Mobile App Integration (Header/Start) – API ist bereit, UI Hook folgt in TP6.2 oder als kleiner Follow-up.

P2: Token usage ausbauen (Badges/Primary Buttons) – bewusst subtil gehalten (Apple-clean).

Next Step
TP 6.2: Mobile App Integration (Branding fetch + caching + Header), optional: accentColor als Theme in Mobile Components.
