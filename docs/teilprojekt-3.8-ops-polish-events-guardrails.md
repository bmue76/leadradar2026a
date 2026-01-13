# Schlussrapport — Teilprojekt 3.8: Ops Polish & Consistency (Events/Devices Guardrails) — ONLINE-only (MVP)

Status: DONE ✅ (pending commit hashes)  
Datum: 2026-01-13  
Commit(s): TBD

## Ziel

MVP Betriebsqualität erhöhen, ohne neue Features zu erfinden:

A) Guardrails konsolidieren (Single Source of Truth)  
B) Admin UX: “Bound devices count” pro Event (Ops-Transparenz)  
C) API Nutzung vereinheitlichen (Events List optional Counts, `/events/active` als Source)  
D) Repro Proof Script (E2E) + `npm run events:smoke`  

## Umsetzung (Highlights)

### A) Guardrails konsolidieren
- Single Source of Truth in `src/server/events/eventGuardrails.ts`:
  - `setEventStatusWithGuards` (ACTIVE invariant + auto-unbind)
  - `assertEventIsBindable` (nur ACTIVE bindbar)
- `src/lib/eventsGuardrails.ts` ist jetzt ein Compat-Wrapper (kein dupliziertes Verhalten).

### B) Admin UX: Bound devices count
- `GET /api/admin/v1/events` kann optional `includeCounts=true`:
  - Items erhalten `boundDevicesCount` (Count von `MobileDevice.activeEventId == eventId`)
- Admin Screen `/admin/events` zeigt eine dezente “Devices”-Spalte (Apple-clean).

### C) API Nutzung vereinheitlichen
- Events List (Counts optional) dokumentiert.
- `/api/admin/v1/events/active` bleibt die “Active Source” und ist dokumentiert.

### D) Repro Proof Script
- Neues Script `scripts/events-guardrails-smoke.mjs` (tracked)
- Neues npm script `npm run events:smoke`
- Prüft reproduzierbar (Atlex + Demo):
  1) Create 2 events → ACTIVE switch → assert event1 ARCHIVED
  2) Bind device → ok
  3) Archive active event → assert devicesUnboundCount > 0

## Dateien/Änderungen

- Guardrails:
  - `src/server/events/eventGuardrails.ts`
  - `src/lib/eventsGuardrails.ts` (Wrapper/Compat)

- API:
  - `src/app/api/admin/v1/events/route.ts` (includeCounts + boundDevicesCount)

- UI:
  - `src/app/(admin)/admin/events/EventsClient.tsx` (Devices-Spalte)

- Scripts:
  - `scripts/events-guardrails-smoke.mjs`
  - `package.json` (events:smoke)
  - `.gitignore` (Script whitelisted)

- Docs:
  - `docs/LeadRadar2026A/03_API.md`
  - `docs/LeadRadar2026A/04_ADMIN_UI.md`
  - `docs/LeadRadar2026A/05_RELEASE_TESTS.md`
  - `docs/teilprojekt-3.8-ops-polish-events-guardrails.md`

## Akzeptanzkriterien – Check

- Tenant-scope überall, mismatch → 404 NOT_FOUND leak-safe ✅ (unverändert, konsistent)
- jsonOk/jsonError + traceId + x-trace-id ✅ (unverändert)
- Zod validateBody/validateQuery only ✅ (Events list erweitert via validateQuery)
- DoD:
  - `npm run typecheck` ✅
  - `npm run lint` ✅
  - `npm run build` ✅
- Proof:
  - `npm run auth:smoke` ✅
  - `npm run events:smoke` ✅

## Tests/Proof (reproduzierbar)

```bash
cd /d/dev/leadradar2026a
npm run auth:smoke
npm run events:smoke
npm run typecheck
npm run lint
npm run build
Offene Punkte/Risiken
events:smoke benötigt mind. 1 vorhandenes Device pro Tenant (über Mobile Ops einmalig provisionieren), sonst bricht es ab. (P1)

Next Step
Commit/Push (Hashes eintragen) und Masterchat-Schlussrapport ergänzen.
