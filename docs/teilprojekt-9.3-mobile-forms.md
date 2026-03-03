# Teilprojekt 9.3 — Mobile Forms Screen (ONLINE-only) — Forms laden + Liste + Detail-Placeholder

Titel + Status + Datum + Commit(s)  
Teilprojekt: 9.3 — Mobile Forms Screen (ONLINE-only)  
Status: DONE  
Datum: 2026-03-02 (Europe/Zurich)  
Commit(s): TBD

## Ziel

Erster produktiver Screen hinter dem Mobile Gate:

- `/forms` lädt Formulare (event-scoped) und zeigt eine saubere Liste
- Tap auf List-Item navigiert auf `/forms/[id]` (Detail-Placeholder als Navigation-Proof)
- Klare States: loading / empty / error inkl. traceId
- Terminologie: UI nutzt „Konto-Kürzel“ (tenantSlug ist UI-hidden)

## Umsetzung (Highlights)

- Backend Contract konsumiert:
  - `GET /api/mobile/v1/forms?eventId=...` → Liste (ACTIVE, tenant-scoped, Visibility Rule)
  - `GET /api/mobile/v1/forms/:id?eventId=...` → Detail (inkl. fields[])
- Mobile:
  - Forms Index: Pull-to-refresh, Reload, klare States, Redirects:
    - 401 → Neu aktivieren (/provision)
    - 402 → /license
    - EVENT_NOT_ACTIVE/NOT_FOUND → /event-gate
  - Forms Detail Placeholder:
    - zeigt formId + Name + fieldsCount
    - Hinweis: Capture/Render folgt (TP 9.4)
- Safe Refactor:
  - bestehender Capture-Screen wird preserviert als `/capture/[id]` (Phase-2/TP9.4 Vorbereitung), ohne TP9.3 Scope zu verletzen.

## Dateien/Änderungen

- apps/mobile/src/lib/auth.ts (ApiKey compatibility + clear everywhere)
- apps/mobile/app/forms/index.tsx (List UI + states + navigation)
- apps/mobile/app/forms/[id].tsx (Detail Placeholder)
- apps/mobile/app/capture/[id].tsx (moved from previous /forms/[id].tsx)

## Akzeptanzkriterien — Check

- ✅ Aktiviert → Forms Screen lädt
- ✅ Empty State / Error State sauber (traceId sichtbar, Retry)
- ✅ Tap → Detail Placeholder öffnet
- ✅ Back/Zur Liste sauber
- ✅ Gate bleibt korrekt (ohne Aktivierung keine Forms)
- ✅ UI: „Konto-Kürzel“ Terminologie bleibt konsistent
- ✅ Code Quality:
  - npm run typecheck → 0 Errors
  - npm run lint → 0 Errors (Warnings ok)
  - cd apps/mobile && npm run lint → 0 Errors

## Tests/Proof (reproduzierbar)

```bash
cd apps/mobile
npx expo start --dev-client -c

Manual Smoke:

Settings: Base URL + Konto-Kürzel korrekt

Ohne Aktivierung → /activate

Aktivieren → Redirect /forms

Forms: Loading → List oder Empty

Tap Form → /forms/[id] Placeholder

App kill/restart → bleibt aktiv → Forms erreichbar

Error: Base URL absichtlich falsch → „Konnte … nicht laden“ + traceId (falls server reached)

Offene Punkte/Risiken

P1: Mobile „Home“-Aggregator (falls vorhanden) darf /forms nicht ohne eventId callen (ansonsten 400). Bei Bedarf separat fixen.

Next Step

TP 9.4 — Form Capture/Render (ONLINE-only) auf /forms/[id] finalisieren (ohne OCR/Offline).
