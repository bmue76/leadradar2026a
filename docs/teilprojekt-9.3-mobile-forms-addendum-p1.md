# Teilprojekt 9.3 — Addendum (P1 Fix) — Home: Forms Call nur mit eventId

Titel + Status + Datum + Commit(s)  
Teilprojekt: 9.3 — Addendum — P1 Fix (Home Forms Call)  
Status: DONE  
Datum: 2026-03-03 (Europe/Zurich)  
Commit(s): f129104 (main → origin/main)

## Ziel

P1 aus TP 9.3 beheben:

- `apps/mobile/src/features/home/useHomeData.ts` hat `/api/mobile/v1/forms` ohne `eventId` aufgerufen
- Backend Contract verlangt `eventId` zwingend → führte zu 400 und potenziell instabilem Home Load

## Umsetzung (Highlights)

- Home-Refresh lädt nun zuerst das aktive Event (`/api/mobile/v1/events/active`)
- Forms werden **nur geladen**, wenn ein `activeEvent.id` vorhanden ist:
  - `GET /api/mobile/v1/forms?eventId=<activeEventId>`
- Wenn kein aktives Event vorhanden ist: Forms Call wird übersprungen (forms = `[]`), kein 400.

## Dateien/Änderungen

- `apps/mobile/src/features/home/useHomeData.ts`
  - Forms Call parametrisiert und event-abhängig gemacht

## Akzeptanzkriterien – Check

- ✅ Kein Request mehr auf `/api/mobile/v1/forms` ohne `eventId`
- ✅ Home Load bleibt stabil, auch wenn noch kein Active Event gesetzt ist
- ✅ Code Quality:
  - npm run typecheck → 0 Errors
  - npm run lint → 0 Errors (Warnings ok)
  - cd apps/mobile && npm run lint → 0 Errors
- ✅ git status clean, Commit gepusht

## Tests/Proof (reproduzierbar)

```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
cd apps/mobile && npm run lint

Manual sanity (Mobile):

App starten (aktiviertes Gerät)

Falls kein aktives Event → Home/Refresh führt nicht zu 400 wegen forms

Sobald aktives Event gesetzt → Forms werden korrekt mit eventId geladen

Offene Punkte/Risiken

P1: Falls Home UI künftig Forms zwingend erwartet, muss UX klar signalisieren: „Event wählen“, solange kein Active Event existiert.

Next Step

TP 9.4 — Capture/Render auf /forms/[id] finalisieren (ONLINE-only)
