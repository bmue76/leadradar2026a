# Teilprojekt 5.1 — Admin Home „Übersicht“ (GoLive-ready) + Home Summary API (Option 2) — ONLINE-only (MVP)

Datum: 2026-01-29  
Status: READY (nach lokalem Proof + Commit/Push) ✅

## Titel + Status + Datum + Commit(s)
- Titel: TP 5.1 — Admin Home Übersicht + /api/admin/v1/home/summary (Option 2)
- Status: READY
- Datum: 2026-01-29
- Commit(s): (nach Commit eintragen)

## Ziel
/admin (Übersicht) wird produktiv nutzbar als Startscreen für den Messebetrieb (Apple-clean, de-CH):
- “Grüezi {givenName}”
- Aktives Event Banner / Empty State “Kein aktives Event”
- Cards: Einsatzbereitschaft (Readiness), Schnellaktionen, Heute (KPIs), Letzte Aktivitäten
- Echte, tenant-scoped Daten via API: GET /api/admin/v1/home/summary
- Produktregel Option 2 berücksichtigt:
  - Mobile zeigt Formulare nur wenn form.status=ACTIVE und form.assignedEventId=activeEvent.id

## Umsetzung (Highlights)
- DB: Form erhält assignedEventId (nullable) + Relation zu Event (onDelete: SetNull).
- Guardrail: Partial unique index → pro Tenant max 1 ACTIVE Event (DB-level; Postgres).
- API: /api/admin/v1/home/summary liefert:
  - me.givenName, tenant meta (slug/displayName/accentColor/logoUrl placeholder)
  - activeEvent (oder null)
  - readiness (Option 2: ACTIVE forms assigned to active event)
  - quickActions (primary/secondary)
  - KPIs (heute + Woche)
  - recentActivity (minimal: Leads/Exports/Devices)
- UI: /admin als “Übersicht” Screen mit Loading/Empty/Error/Retry.

## Dateien/Änderungen
- prisma/schema.prisma
- prisma/migrations/20260129070000_tp5_1_form_assigned_event/migration.sql
- src/app/api/admin/v1/home/summary/route.ts
- src/app/(admin)/admin/_components/AdminHomeOverview.tsx
- src/app/(admin)/admin/page.tsx
- docs/teilprojekt-5.1-admin-home-summary.md
- docs/LeadRadar2026A/00_INDEX.md

## Akzeptanzkriterien – Check
- [x] Option 2 DB: Form.assignedEventId (nullable) + Relation
- [x] Guardrail: pro Tenant max 1 ACTIVE Event (DB partial unique index)
- [x] Endpoint: GET /api/admin/v1/home/summary (jsonOk/jsonError + traceId)
- [x] Tenant-scope: alle Reads via tenantId aus requireAdminAuth
- [x] Readiness Logik:
  - kein aktives Event → overall BLOCK
  - aktives Event + 0 zugewiesene ACTIVE Forms → Assignment BLOCK (Action /admin/forms)
  - Device check MVP: WARN (24h window)
- [x] UI: /admin zeigt Loading/Empty/Error/Retry, Actions routen korrekt
- [x] Copy: de-CH

## Tests/Proof (reproduzierbar)

### DB Migration + Generate
```bash
npx prisma migrate dev
npx prisma generate
Commands
bash
Code kopieren
npm run typecheck
npm run lint
npm run build
API Proof (2 Fälle)
Auth: Cookie aus Browser-Session (lr_session / NextAuth). Beispiel: Cookie Header aus DevTools kopieren.

Fall A: kein aktives Event → readiness BLOCK

Stelle sicher: Tenant hat kein Event mit status=ACTIVE (via Admin UI / Prisma Studio).

Call:

bash
Code kopieren
curl -i \
  -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/home/summary"
Erwartung:

activeEvent = null

readiness.overall = BLOCK

ACTIVE_EVENT_PRESENT = BLOCK

ACTIVE_FORMS_ASSIGNED_TO_ACTIVE_EVENT = BLOCK

Fall B: aktives Event + 0 zugewiesene ACTIVE Forms → BLOCK auf Assignment

Stelle sicher: ein Event ist ACTIVE.

Stelle sicher: kein Form hat (status=ACTIVE AND assignedEventId=<activeEvent.id>).

Call:

bash
Code kopieren
curl -i \
  -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/home/summary"
Erwartung:

activeEvent != null

ACTIVE_FORMS_ASSIGNED_TO_ACTIVE_EVENT = BLOCK (Action → /admin/forms)

UI Proof
/admin öffnen → lädt Summary

Fall A/B in UI prüfen:

Subline: “Kein aktives Event” oder “{Event} • AKTIVES EVENT”

Readiness reagiert korrekt

Schnellaktionen führen auf /admin/events, /admin/forms, /admin/devices, /admin/exports

Offene Punkte/Risiken (P0/P1/…)
P0: Falls Migration wegen mehreren ACTIVE Events fehlschlägt → Daten bereinigen, dann Migration erneut.

P1: tenant.logoUrl ist aktuell placeholder (/api/admin/v1/tenants/current/logo). Falls Logo-Route anders heisst, später anpassen.

P1: Device “connected” ist MVP (lastSeenAt in 24h). Feintuning später möglich.

P1: recentActivity nutzt minimale Quellen (Leads/Exports/Devices). EventActivated/FormAssigned optional später.

Next Step
Form-UI: Event Assignment im Forms Screen (assignedEventId setzen) – damit Option 2 voll administrierbar wird.
