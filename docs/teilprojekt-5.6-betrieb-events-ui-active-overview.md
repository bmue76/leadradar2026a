# Teilprojekt 5.6 — Betrieb: Events UI + Active-Event Overview (Forms/Devices) — ONLINE-only (GoLive MVP)

Datum: 2026-02-01  
Status: IN ARBEIT (Code vorbereitet, Proof/Commit folgt im Repo)

## Ziel

Betrieb → Events ist GoLive-ready und macht die Produktregel „Option 2“ operativ verständlich:

- Admin kann Events erstellen/bearbeiten (Name, Zeitraum, Ort optional)
- Admin kann genau **ein Event aktiv** setzen (Guardrail: max 1 ACTIVE pro Tenant)
- Admin kann Events archivieren (ARCHIVED)
- Screen zeigt eine „Aktives Event“ Card inkl. Bind-Counts:
  - ACTIVE Formulare, die dem aktiven Event zugewiesen sind (Form.status=ACTIVE && Form.assignedEventId=activeEvent.id)
  - Geräte, die ans aktive Event gebunden sind (Device.activeEventId=activeEvent.id)
- Quick Links zu /admin/forms und /admin/devices

## Scope / Regeln

- Phase 1: ONLINE-only (kein Offline/Sync)
- Backend bleibt immer nutzbar (Admin nie blocken)
- Tenant-scope leak-safe: falscher Tenant/ID → 404 NOT_FOUND
- API Standards: jsonOk/jsonError + traceId + x-trace-id
- Validation: Zod + validateBody/validateQuery
- DB Guardrail „max 1 ACTIVE Event pro Tenant“ wird respektiert (transactional activate)

## Umsetzung (Highlights)

### API

- GET /api/admin/v1/events
  - Filter: q, status, sort, dir
- POST /api/admin/v1/events
  - erstellt DRAFT Event
- PATCH /api/admin/v1/events/:id
  - editierbar: name, startsAt, endsAt, location
- POST /api/admin/v1/events/:id/activate
  - transaction: deaktiviert allfälliges bisheriges ACTIVE → DRAFT, setzt Target ACTIVE
  - archived events nicht aktivierbar (409 EVENT_ARCHIVED)
- POST /api/admin/v1/events/:id/archive
  - setzt ARCHIVED; wenn ACTIVE → danach kein aktives Event
- GET /api/admin/v1/events/active/overview
  - activeEvent (oder null) + counts + CTAs

### UI

- /admin/events:
  - Title + Hint („Ein Event kann aktiv sein…“)
  - Top Card „Aktives Event“ inkl. Counts und Quick Links
  - Toolbar: Status Pills, Suche (debounced), Sort, Refresh, Reset
  - Finder-like List mit Hover Actions: Aktivieren/Bearbeiten/Archivieren
  - Drawer (rechts) für Create/Edit inkl. Confirm Dialogs für Activate/Archive

## Dateien / Änderungen

Neue Dateien:

- src/app/api/admin/v1/events/_repo.ts
- src/app/api/admin/v1/events/route.ts
- src/app/api/admin/v1/events/[id]/route.ts
- src/app/api/admin/v1/events/[id]/activate/route.ts
- src/app/api/admin/v1/events/[id]/archive/route.ts
- src/app/api/admin/v1/events/active/overview/route.ts
- src/app/(admin)/admin/events/page.tsx
- src/app/(admin)/admin/events/EventsScreenClient.tsx
- docs/teilprojekt-5.6-betrieb-events-ui-active-overview.md

Noch zu ergänzen (repo-spezifisch):

- docs/LeadRadar2026A/00_INDEX.md: Link auf TP 5.6 ergänzen
- Admin Sidebar/Nav: Menüpunkt „Events“ unter Betrieb (falls noch nicht vorhanden)

## Akzeptanzkriterien — Check (Soll)

- [ ] /admin/events lädt Liste ohne Errors
- [ ] Neues Event erstellen → erscheint in Liste
- [ ] Aktiv setzen → Active Card zeigt Event + Counts + CTAs
- [ ] /admin/forms: mind. 1 ACTIVE Form assignedEventId=activeEvent.id → Count steigt
- [ ] /admin/devices: device.activeEventId=activeEvent.id → Count steigt
- [ ] Archivieren → Active Card zeigt „Kein aktives Event“
- [ ] Leak-safe: fremder Tenant/ID → 404

## Tests / Proof (reproduzierbar)

### Commands

cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build

### API Proof (curl)

List:
curl -i -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/events?status=ALL"

Create:
curl -i -X POST -H "cookie: lr_session=DEIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"Swissbau 2026","startsAt":"2026-01-20","endsAt":"2026-01-23","location":"Basel"}' \
  "http://localhost:3000/api/admin/v1/events"

Activate:
curl -i -X POST -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/events/EVENT_ID/activate"

Active overview:
curl -i -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/events/active/overview"

Archive:
curl -i -X POST -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/events/EVENT_ID/archive"

### UI Smoke

/admin/events öffnen → Liste lädt
Neues Event erstellen → erscheint in Liste
„Aktiv setzen“ → Active Card zeigt Event + Counts
/admin/forms → ACTIVE + assignedEventId setzen → Count steigt
/admin/devices → activeEventId setzen → Count steigt
Archivieren → Active Card zeigt „Kein aktives Event“

## Offene Punkte / Risiken

P0:
- Repo-spezifische Integration: Sidebar/Nav Item + 00_INDEX Link fehlt noch (ohne Overwrite liefern)

P1:
- Falls Event-Felder (startsAt/endsAt/location) im Prisma Schema anders heissen/fehlen → minimaler Schema-Abgleich nötig.

## Next Step

1) Sidebar/Nav + 00_INDEX mit bestehenden Dateien sauber ergänzen  
2) Tests/Proof laufen lassen (typecheck/lint/build + curl + UI smoke)  
3) Commit/Push: feat(tp5.6): events ui + activate/archive guardrails + active overview counts
