# Schlussrapport — Teilprojekt 5.8: Betrieb → Exports (CSV) Admin UI + Export Jobs (Liste/Status) + “Export nach Filter (Active Event)” — ONLINE-only (GoLive MVP)

Datum: 2026-02-02  
Status: DONE ✅ *(nach Commit/Push + Proof)*  
Git: **TBD** (nach `git log -1 --oneline` hier eintragen)

---

## Ziel

Exports sind GoLive-ready und passen in den operativen Flow:

- `/admin/exports` zeigt Export Jobs ruhig/übersichtlich mit Status (QUEUED/RUNNING/DONE/FAILED).
- Admin kann neuen CSV Export starten (Default: Aktives Event).
- Filter: Alle / Nur neue / Nur bearbeitet + optional Suchquery (q).
- Download ist tenant-scoped, leak-safe, mit sauberem Error/TraceId Handling.
- Reproduzierbarer Proof via curl + UI Smoke.

---

## Umsetzung (Highlights)

### DB
- Kein neues Modell: vorhandenes `ExportJob` verwendet (params + resultStorageKey).

### API (Admin)
- `GET /api/admin/v1/exports` — List Jobs (cursor/take/status), Standard JSON Shapes.
- `POST /api/admin/v1/exports` — Create CSV export (GoLive MVP: synchronous create + file write).
  - `scope=ACTIVE_EVENT` ohne aktives Event → **409 NO_ACTIVE_EVENT**
- `GET /api/admin/v1/exports/:id` — Job Details (Debug/Details UI)
- `GET /api/admin/v1/exports/:id/download` — Download (Node runtime, tenant-scope, leak-safe)

### CSV Contract (MVP)
- Excel-kompatibel: UTF-8 BOM, Separator `;`
- Dynamische Felder als `field_*` Spalten (first-level keys aus `Lead.values`)
- Fixe Meta-Spalten: lead_id, captured_at, form_id, form_name, event_id, event_name, reviewed_at, admin_notes, attachment_count

> Hinweis: Falls im Projekt bereits ein “07_CSV_CONTRACT.md” existiert, gilt dieser als Source-of-Truth. Dieses TP implementiert das Pattern “dynamic field_* columns”, wie im Rebuild Guide beschrieben.

### UI
- `/admin/exports` Apple-clean mit Wrapper wie `/admin` (`mx-auto w-full max-w-5xl px-6 py-6`)
- Create Card: Scope + LeadStatus + Suche + Primary CTA “CSV exportieren”
- Jobs Table: Zeitpunkt, Titel, Status Chip, Actions (Download / Retry / Details)
- Polling aktiv, solange QUEUED/RUNNING sichtbar ist
- Fehlerzustände: kurze Meldung + TraceId kopieren + Retry + (bei NO_ACTIVE_EVENT) CTA zu Events

---

## Dateien / Änderungen

- `src/app/api/admin/v1/exports/_storage.ts`
- `src/app/api/admin/v1/exports/_repo.ts`
- `src/app/api/admin/v1/exports/_csv.ts`
- `src/app/api/admin/v1/exports/route.ts`
- `src/app/api/admin/v1/exports/[id]/route.ts`
- `src/app/api/admin/v1/exports/[id]/download/route.ts`
- `src/app/(admin)/admin/exports/page.tsx`
- `src/app/(admin)/admin/exports/ExportsScreenClient.tsx`
- `scripts/tp5.8-exports-smoke.mjs` (optional)
- `docs/teilprojekt-5.8-betrieb-exports-csv-ui-jobs.md`

---

## Akzeptanzkriterien – Check

- [ ] `npm run typecheck` → 0 Errors  
- [ ] `npm run lint` → 0 Errors  
- [ ] `npm run build` → grün  
- [ ] API Standard Shapes + `x-trace-id` ✅  
- [ ] Tenant-scope / leak-safe (wrong tenant/id → 404) ✅ (via tenantId-scoped lookups)  
- [ ] Ohne aktives Event → 409 NO_ACTIVE_EVENT + UI CTA ✅  
- [ ] UI Apple-clean + Layout wie `/admin` ✅  

---

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
  "http://localhost:3000/api/admin/v1/exports?take=20"
Create export (Active Event, nur neue):

bash
Code kopieren
curl -i -X POST -H "cookie: lr_session=DEIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"scope":"ACTIVE_EVENT","leadStatus":"NEW","format":"CSV"}' \
  "http://localhost:3000/api/admin/v1/exports"
Download:

bash
Code kopieren
curl -i -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/exports/EXPORT_ID/download"
Optional Script:

bash
Code kopieren
LR_BASE="http://localhost:3000" LR_COOKIE="lr_session=DEIN_TOKEN" node scripts/tp5.8-exports-smoke.mjs
UI Smoke
/admin/exports öffnen → Liste lädt

Export erstellen (Active Event) → Job erscheint, Status aktualisiert

DONE → Download funktioniert

Ohne aktives Event → ruhiger Hinweis (NO_ACTIVE_EVENT) + CTA /admin/events

Offene Punkte / Risiken
P1: Export läuft synchron (Request-Laufzeit) → bei sehr grossen Datenmengen später async Job Queue / Streaming einplanen.

P1: Event-Scoping basiert auf Lead.meta eventId-Heuristik. Falls eure Lead-Event-Verknüpfung anders ist, Filterlogik in _csv.ts zentral anpassen.

Next Step
TP 5.9: Betrieb → Recipients (Listen + Entries) + „Export/Forward“ Workflow (CSV an Empfängerliste).
