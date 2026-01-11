# Schlussrapport — Teilprojekt 3.4: Exports event-aware (CSV Filter + Columns + Admin UI) — ONLINE-only (MVP)

Status: READY FOR TEST ✅  
Datum: 2026-01-11 (Europe/Zurich)  
Commits (main): TBD

---

## Ziel

CSV Exports so erweitern, dass sie im Messebetrieb event-tauglich sind:
- Filter optional nach `eventId` (und weiter nach `formId`/Date range)
- CSV enthält `eventId` als eigene Spalte (deterministisch)
- Admin UI bietet Event-Auswahl im Export-Modal
- Leak-safe Tenant-Scope: falsche `eventId`/`formId` → 404 NOT_FOUND

---

## Umsetzung (Highlights)

### Backend (API + Export Runner)
- `POST /api/admin/v1/exports/csv` erweitert um Filter:
  - `eventId?`, `formId?`, `from?`, `to?`, `includeDeleted?`, `limit?`
- Leak-safe Validierung:
  - `eventId` existiert nicht im Tenant → 404 NOT_FOUND
  - `formId` existiert nicht im Tenant → 404 NOT_FOUND
- CSV Columns (stable order, columnsVersion=2):
  - `leadId, eventId, formId, capturedAt, isDeleted, deletedAt, deletedReason, values_json`

### Admin UI (`/admin/exports`)
- Create Modal:
  - Event Dropdown (ACTIVE events) + optional Form + Date range + Include deleted
- Jobs Table:
  - Filter Summary in Meta-Line (Event/Form/Range/Include deleted)

---

## DB / Migration

Keine Migration nötig:
- Prisma Schema enthält bereits Index `Lead @@index([tenantId, eventId, capturedAt])` (export-relevant).

---

## Dateien/Änderungen

- `src/lib/exportCsv.ts`
- `src/app/api/admin/v1/exports/csv/route.ts`
- `src/app/(admin)/admin/exports/ExportsClient.tsx`
- `src/app/(admin)/admin/exports/ExportCreateModal.tsx`
- `docs/LeadRadar2026A/03_API.md`
- `docs/LeadRadar2026A/04_ADMIN_UI.md`
- `docs/teilprojekt-3.4-exports-event-aware.md`

---

## Akzeptanzkriterien – Check

- ✅ Export CSV Job kann optional nach eventId filtern
- ✅ CSV enthält eventId Spalte (leer wenn event=null)
- ✅ Admin UI erlaubt Event-Auswahl beim Export
- ✅ Leak-safe: fremde eventId/formId → 404 NOT_FOUND
- ✅ DoD vorbereitbar (typecheck/lint/build + Proof + Docs + git clean + push)

---

## Tests/Proof (reproduzierbar)

### Precondition
- `/admin/events`: Event ACTIVE
- `/admin/settings/mobile`: Device activeEvent gesetzt
- Mobile App: mind. 2 Leads erfassen (eventId gesetzt)

### Local checks
```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build
npm run dev
API Proof
Create export for Event:

bash
Code kopieren
curl -i -H "x-tenant-slug: atlex" -H "content-type: application/json" \
  -d '{"eventId":"<EVENT_ID>","includeDeleted":false,"limit":10000}' \
  http://localhost:3000/api/admin/v1/exports/csv
Leak-safe (unknown eventId):

bash
Code kopieren
curl -i -H "x-tenant-slug: atlex" -H "content-type: application/json" \
  -d '{"eventId":"does_not_exist","includeDeleted":false,"limit":100}' \
  http://localhost:3000/api/admin/v1/exports/csv
# Erwartet: 404 NOT_FOUND
Download:

bash
Code kopieren
curl -i -H "x-tenant-slug: atlex" \
  http://localhost:3000/api/admin/v1/exports/<JOB_ID>/download
# Erwartet: CSV header enthält eventId + rows mit eventId values
UI Proof
/admin/exports

Create Export → Event wählen → Create

Job DONE → Download

CSV enthält Spalte eventId und Werte

Offene Punkte/Risiken
P1: Event Dropdown zeigt nur ACTIVE events (MVP). Falls “ALL” UX nötig → Toggle in Modal + Query ohne status.

P1: ExportJob List/Detail könnte Filter-Summary serverseitig anreichern (optional, derzeit UI-seitig).

Next Step
TP 3.5: Optional “ALL events” Toggle im Modal + eventName optional im Export (nur falls performant & gewünscht)
