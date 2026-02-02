# Schlussrapport — Teilprojekt 5.8: Betrieb → Exports (CSV) Admin UI + Export Jobs (Liste/Status) + “Export nach Filter (Active Event)” — ONLINE-only (GoLive MVP)

Datum: 2026-02-02  
Status: DONE ✅  
Git: e9110d9 — feat(tp5.8): exports jobs api + csv export + admin exports ui

## Ziel

Exports sind GoLive-ready und passen in den operativen Flow:

- `/admin/exports` zeigt Export Jobs ruhig/übersichtlich inkl. Status (QUEUED/RUNNING/DONE/FAILED).
- Admin kann neue CSV-Exports starten (Default: **Aktives Event**).
- Optional: Filter **Nur neue** (reviewedAt fehlt) / **Nur bearbeitet**.
- Optional: Suchquery `q`.
- Export folgt dem bestehenden CSV-Contract-Prinzip (inkl. dynamischer `field_*` Spalten).
- Download via sichere tenant-scoped Route.

## Umsetzung (Highlights)

### API (Admin)
- `GET /api/admin/v1/exports`
  - Pagination via `take` + `cursor`
  - Filter via `status=ALL|QUEUED|RUNNING|DONE|FAILED`
  - Response liefert `items[]` inkl. `title`, `rowCount`, `fileName`, `fileUrl`, Error/TraceId.
- `POST /api/admin/v1/exports`
  - Body: `scope=ACTIVE_EVENT|ALL` (default ACTIVE_EVENT), `leadStatus=ALL|NEW|REVIEWED`, optional `q`, `format=CSV`.
  - GoLive-safe: wenn `scope=ACTIVE_EVENT` und kein aktives Event vorhanden → **409 NO_ACTIVE_EVENT**.
  - Tenant-scope (leak-safe): falscher Tenant/ID → 404 NOT_FOUND.
  - Export läuft MVP-synchron (Job wird QUEUED→RUNNING→DONE/FAILED gesetzt).
- `GET /api/admin/v1/exports/:id`
  - Job Detail (für Debug/Operations) inkl. timestamps/params/resultStorageKey.
- `GET /api/admin/v1/exports/:id/download`
  - tenant-scoped Download
  - nur wenn DONE (sonst 409 NOT_READY)
  - liefert CSV als `text/csv; charset=utf-8` + attachment filename

### CSV-Generator
- Exportiert Leads (tenant scoped), filtert:
  - ACTIVE_EVENT: nur Leads mit EventId in `Lead.meta` (heuristisch: eventId/activeEventId/…)
  - LeadStatus: NEW (reviewedAt fehlt) / REVIEWED (reviewedAt vorhanden)
  - q: substring search über JSON (values+meta) für MVP
- Dynamische Spalten: `field_<key>` aus `Lead.values`
- Excel-freundlich:
  - Separator `;`
  - BOM `\ufeff` für sauberes UTF-8 in Excel
  - Strings werden immer gequotet und Quotes gedoppelt

### Admin UI `/admin/exports`
- Layout exakt wie `/admin` (Wrapper in server `page.tsx`, Client ohne outer padding).
- “Export erstellen” Card:
  - Scope (Aktives Event/Alle), Leads (Alle/Nur neue/Nur bearbeitet), Suche (optional)
  - Button: „CSV exportieren“
  - Fehlerzustände inkl. TraceId + „TraceId kopieren“ + CTA „Zu Events“ bei NO_ACTIVE_EVENT
- “Letzte Exporte” Table:
  - Zeitpunkt/Update, Titel, Status-Pill, Aktionen (Download/Retry/Details)
  - Details als expand row: Filter, Job-ID, Fehler + TraceId Copy
  - Polling aktiv, wenn Jobs RUNNING/QUEUED vorhanden

## Dateien / Änderungen

- `src/app/(admin)/admin/exports/page.tsx`
- `src/app/(admin)/admin/exports/ExportsScreenClient.tsx`
- `src/app/api/admin/v1/exports/route.ts`
- `src/app/api/admin/v1/exports/[id]/route.ts`
- `src/app/api/admin/v1/exports/[id]/download/route.ts`
- `src/app/api/admin/v1/exports/_repo.ts`
- `src/app/api/admin/v1/exports/_csv.ts`
- `src/app/api/admin/v1/exports/_storage.ts`

## Akzeptanzkriterien — Check

- ✅ `/admin/exports` zeigt Jobs inkl. Status (QUEUED/RUNNING/DONE/FAILED)
- ✅ Export erstellen: Default ACTIVE_EVENT, optional leadStatus + q
- ✅ Ohne aktives Event: 409 NO_ACTIVE_EVENT (GoLive klar) + UI CTA zu Events
- ✅ Download nur wenn DONE, tenant-scoped, leak-safe
- ✅ API Standard Responses via jsonOk/jsonError + traceId + x-trace-id
- ✅ ONLINE-only, Admin wird nicht geblockt (synchroner Export im Request)
- ✅ Typecheck/Lint/Build grün

## Tests / Proof (reproduzierbar)

### DoD Commands
```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build
API Proof (curl)
bash
Code kopieren
# LIST
curl -i -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/exports?take=20"

# CREATE (Active Event, nur neue)
curl -i -X POST -H "cookie: lr_session=DEIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"scope":"ACTIVE_EVENT","leadStatus":"NEW","format":"CSV"}' \
  "http://localhost:3000/api/admin/v1/exports"

# DOWNLOAD (Export-ID aus Response/LIST)
curl -i -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/exports/EXPORT_ID/download"
UI Smoke
/admin/exports öffnen → Liste lädt

Export erstellen (Active Event) → neuer Job erscheint

DONE → Download funktioniert (CSV wird geladen)

(Optional) Kein aktives Event → Hinweis/Fehler mit CTA „Zu Events“

Offene Punkte / Risiken
P1: Export filtert aktuell nach q via einfache JSON-String-Suche (MVP ok, später ggf. gezielter/performanter).

P1: ACTIVE_EVENT Filter hängt an EventId-Heuristik in Lead.meta (kompatibel mit Alt-Daten, später evtl. saubere Spalte/Relation).

P1: Integrations-CTA „Exportieren“ direkt aus /admin/leads (mit Query Param Defaults) ist noch optional/nice-to-have.

Next Step
Optional: /admin/leads → Button „Exportieren“ der Defaults (scope, leadStatus, q) an /admin/exports übergibt.

Optional: Export Queue/Async Worker, falls Datenvolumen stark wächst (Phase 2 / Betrieb).
