# Teilprojekt 5.1 — Admin Home „Übersicht“ (GoLive-ready) + Home Summary API (Option 2) — ONLINE-only (MVP)

Datum: 2026-01-29  
Status: READY ✅

## Titel + Status + Datum + Commit(s)
- Titel: TP 5.1 — Admin Home Übersicht + /api/admin/v1/home/summary (Option 2)
- Status: READY
- Datum: 2026-01-29
- Commit(s):
  - 096cb3e — feat(tp5.1): admin home summary (option2 form assignment)
  - 7b32296 — fix(tp5.1): admin overview styling + globals lr ui primitives
  - 5a62d77 — fix(tp5.1): polish copy for business card kpi
  - 5b6e808 — fix(tp5.1): add form assignedEventId + polish export activity titles
  - <MIGRATION_COMMIT_HASH> — chore(db): add tp5.1 form assignedEventId migration

## Ziel
/admin (Übersicht) wird produktiv nutzbar als Startscreen für den Messebetrieb (Apple-clean, de-CH):
- “Grüezi {givenName}” (aus `firstName`, fallback “Grüezi”)
- Aktives Event Banner / Empty State “Kein aktives Event”
- Cards: Einsatzbereitschaft (Readiness), Schnellaktionen, Heute (KPIs), Letzte Aktivitäten
- Echte, tenant-scoped Daten via API: `GET /api/admin/v1/home/summary`
- Produktregel Option 2 berücksichtigt:
  - Mobile zeigt Formulare nur wenn `form.status=ACTIVE` und `form.assignedEventId=activeEvent.id`

## Umsetzung (Highlights)
- DB (Option 2, MVP-lean):
  - `Form.assignedEventId` (nullable) + Relation zu `Event` (`onDelete: SetNull`)
- API:
  - `GET /api/admin/v1/home/summary` liefert:
    - `me.givenName`
    - `tenant` Meta (slug/displayName/accentColor/logoUrl)
    - `activeEvent` (oder `null`)
    - `readiness` (Option 2: ACTIVE Forms dem aktiven Event zugewiesen)
    - `quickActions` (primary/secondary)
    - KPIs (Heute + diese Woche)
    - `recentActivity` (minimal: Leads/Exports/Devices)
  - Standard Responses: `jsonOk/jsonError` inkl. `traceId` + `x-trace-id`
  - Tenant-scope: alle Reads via `tenantId` aus `requireAdminAuth`
- UI:
  - /admin als „Übersicht“ Screen mit Loading/Empty/Error/Retry

## Dateien/Änderungen
- prisma/schema.prisma
- prisma/migrations/20260129212541_tp5_1_form_assigned_event/migration.sql
- src/app/api/admin/v1/home/summary/route.ts
- src/app/(admin)/admin/_components/AdminHomeOverview.tsx
- src/app/(admin)/admin/page.tsx
- docs/teilprojekt-5.1-admin-home-summary.md
- docs/LeadRadar2026A/00_INDEX.md

## Akzeptanzkriterien – Check
- [x] Option 2 DB: `Form.assignedEventId` (nullable) + Relation
- [x] Endpoint: `GET /api/admin/v1/home/summary` (jsonOk/jsonError + traceId)
- [x] Tenant-scope: alle Reads via `tenantId` aus `requireAdminAuth`
- [x] Readiness Logik:
  - kein aktives Event → overall BLOCK
  - aktives Event + 0 zugewiesene ACTIVE Forms → Assignment BLOCK (Action /admin/forms)
  - Device check MVP: WARN (24h window)
- [x] UI: /admin zeigt Loading/Empty/Error/Retry, Actions routen korrekt
- [x] Copy: de-CH
- [x] Quality Gates: typecheck/lint/build grün

## Tests/Proof (reproduzierbar)

### Commands
```bash
npx prisma migrate dev
npx prisma generate

npm run typecheck
npm run lint
npm run build
API Proof (2 Fälle)
Auth: Cookie aus Browser-Session (z.B. lr_session). Cookie Header aus DevTools kopieren.

Fall A: kein aktives Event → readiness BLOCK
Setup: Tenant hat kein Event mit status=ACTIVE (via Admin UI / Prisma Studio).

Call:

bash
Code kopieren
curl -i \
  -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/home/summary"
Erwartung:

activeEvent = null

readiness.overall = "BLOCK"

Item ACTIVE_EVENT_PRESENT = BLOCK

Item ACTIVE_FORMS_ASSIGNED_TO_ACTIVE_EVENT = BLOCK

Fall B: aktives Event + 0 zugewiesene ACTIVE Forms → Assignment BLOCK
Setup:

Ein Event ist ACTIVE

Kein Form erfüllt (status=ACTIVE AND assignedEventId=<activeEvent.id>)

Call:

bash
Code kopieren
curl -i \
  -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/home/summary"
Erwartung:

activeEvent != null

Item ACTIVE_FORMS_ASSIGNED_TO_ACTIVE_EVENT = BLOCK

Item hat action.href = "/admin/forms"

UI Proof
/admin öffnen → lädt Summary

Fall A/B in UI prüfen:

Subline: “Kein aktives Event” oder “{Event} • AKTIVES EVENT”

Readiness reagiert korrekt

Schnellaktionen führen auf /admin/events, /admin/forms, /admin/devices, /admin/exports

Offene Punkte/Risiken (P0/P1/…)
P0: Falls Migration wegen bestehender Datenkonflikte scheitert → Daten bereinigen, Migration erneut ausführen.

P1: tenant.logoUrl nutzt aktuell /api/admin/v1/tenants/current/logo – falls Route anders heisst, später anpassen.

P1: Device “connected” ist MVP (lastSeenAt innerhalb 24h) – Feintuning später möglich.

P1: recentActivity nutzt minimale Quellen (Leads/Exports/Devices). EventActivated/FormAssigned kann später ergänzt werden.

Next Step
Form-UI: Event Assignment im Forms Screen (assignedEventId setzen) – damit Option 2 voll administrierbar wird.
