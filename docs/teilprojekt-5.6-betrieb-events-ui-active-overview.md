# Schlussrapport — Teilprojekt 5.6: Betrieb → Events UI + Active-Event Bind Overview (Forms/Devices) — ONLINE-only (GoLive MVP)

Datum: 2026-02-01  
Status: DONE ✅  
Git: b38e3a9 — feat(tp5.6): events ui + activate/archive guardrails + active overview counts

## Ziel

Betrieb → Events GoLive-ready umsetzen, sodass Option 2 operativ verständlich und steuerbar ist:

- Admin kann Events erstellen und bearbeiten (Name, Datumspanne, Ort optional)
- Admin kann Events aktiv setzen (max. 1 ACTIVE pro Tenant, Guardrail)
- Admin kann Events archivieren
- Screen zeigt Active-Event Overview inkl. Bind-Counts:
  - ACTIVE Formulare, die dem aktiven Event zugewiesen sind (Form.status=ACTIVE && Form.assignedEventId=activeEvent.id)
  - Geräte, die ans aktive Event gebunden sind (Device.activeEventId=activeEvent.id)
- Quick Links/CTAs zu /admin/forms und /admin/devices

## Umsetzung (Highlights)

### API (Admin)
- **GET /api/admin/v1/events**
  - Filter: q, status (ALL|DRAFT|ACTIVE|ARCHIVED), sort (updatedAt|startsAt|name), dir (asc|desc)
  - Tenant-scoped, leak-safe über Admin Auth
- **POST /api/admin/v1/events**
  - Create DRAFT Event (startsAt/endsAt/location optional)
- **PATCH /api/admin/v1/events/:id**
  - Update name/startsAt/endsAt/location (null möglich)
- **POST /api/admin/v1/events/:id/activate**
  - Transactional: deaktiviert allfälliges ACTIVE → DRAFT, setzt Target → ACTIVE
  - Archived kann nicht aktiviert werden (409 EVENT_ARCHIVED)
  - DB-Guardrail (max 1 ACTIVE) wird respektiert (P2002 → 409 KEY_CONFLICT)
- **POST /api/admin/v1/events/:id/archive**
  - status → ARCHIVED; wenn ACTIVE → danach kein aktives Event
- **GET /api/admin/v1/events/active/overview**
  - activeEvent oder null + counts + actions

### UI (Admin) — /admin/events
- Apple-clean Screen mit:
  - Header + Hint: „Ein Event kann aktiv sein. Die App arbeitet immer mit dem aktiven Event.“
  - Top Card „Aktives Event“:
    - Name + Zeitraum/Ort (optional)
    - KPIs: „Formulare zugewiesen“, „Geräte verbunden“
    - CTAs zu /admin/forms & /admin/devices
    - Ruhiger Empty State wenn kein aktives Event
  - Toolbar: Status Pills, Suche (debounced), Sort, Refresh, Reset
  - Finder-like Liste mit Hover-Actions (Aktivieren / Archivieren / Bearbeiten)
  - Drawer (rechts) für Create/Edit inkl. Confirm-Dialogen für Aktivieren/Archivieren

## Dateien / Änderungen

Neu/angepasst (TP 5.6):
- src/app/api/admin/v1/events/_repo.ts
- src/app/api/admin/v1/events/route.ts
- src/app/api/admin/v1/events/[id]/route.ts
- src/app/api/admin/v1/events/[id]/activate/route.ts
- src/app/api/admin/v1/events/[id]/archive/route.ts
- src/app/api/admin/v1/events/active/overview/route.ts
- src/app/(admin)/admin/events/page.tsx
- src/app/(admin)/admin/events/EventsScreenClient.tsx
- docs/teilprojekt-5.6-betrieb-events-ui-active-overview.md
- docs/LeadRadar2026A/00_INDEX.md

Hinweis:
- SidebarNav hatte „Betrieb → Events“ bereits korrekt enthalten → keine Änderung nötig.

## Akzeptanzkriterien — Check ✅

- [x] /admin/events lädt Liste (ruhig, Apple-clean)
- [x] Neues Event erstellen → erscheint in Liste (DRAFT)
- [x] Aktiv setzen → macht Event zum einzigen ACTIVE Event (Guardrail via Transaction)
- [x] Active Card zeigt aktives Event + Bind Counts + CTAs
- [x] /admin/forms → ACTIVE + assignedEventId setzen → assignedActiveForms steigt
- [x] /admin/devices → activeEventId setzen → boundDevices steigt
- [x] Archivieren → Active Card zeigt „Kein aktives Event“
- [x] Tenant-scope leak-safe: falscher Tenant/ID → 404 NOT_FOUND
- [x] API Standards: jsonOk/jsonError + traceId + x-trace-id
- [x] Validation: Zod + validateBody/validateQuery

## Tests / Proof (reproduzierbar)

### Commands
```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build
API Proof (curl)
List:

bash
Code kopieren
curl -i -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/events?status=ALL"
Create:

bash
Code kopieren
curl -i -X POST -H "cookie: lr_session=DEIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"Swissbau 2026","startsAt":"2026-01-20","endsAt":"2026-01-23","location":"Basel"}' \
  "http://localhost:3000/api/admin/v1/events"
Activate:

bash
Code kopieren
curl -i -X POST -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/events/EVENT_ID/activate"
Active overview:

bash
Code kopieren
curl -i -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/events/active/overview"
Archive:

bash
Code kopieren
curl -i -X POST -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/events/EVENT_ID/archive"
UI Smoke
/admin/events öffnen → Liste lädt

Neues Event erstellen → erscheint in Liste

„Aktiv setzen“ → Active Card zeigt Event + Counts + CTAs

/admin/forms → mind. 1 ACTIVE + assignedEventId=activeEvent.id setzen → Count steigt

/admin/devices → device.activeEventId=activeEvent.id setzen → Count steigt

Event archivieren → Active Card zeigt „Kein aktives Event“

Offene Punkte / Risiken
P0

Repo ist aktuell nicht clean: docs/teilprojekt-5.5-billing-stripe-packages-credits.md ist modified (nicht Teil von TP 5.6). Vor GoLive/Release bitte bereinigen oder separat committen.

P1

Device-Count nutzt Delegate-Fallback (mobileDevice/device) — funktioniert robust, kann später mit exaktem Prisma-Modelnamen 100% typisiert werden.

Next Step
Working Tree bereinigen: TP 5.5-Doku entweder revert oder als eigener docs-Commit abschliessen.

Optional: Device-Modelnamen im Prisma fix identifizieren und den Fallback im Events Overview auf den korrekten Delegate „hart“ typisieren.

Danach weiter mit nächstem Teilprojekt gemäss Roadmap (z. B. Betrieb → Events-Details/Readiness-Verknüpfung auf Admin Home, falls gewünscht).
