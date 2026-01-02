# Teilprojekt 1.8: Exports CSV (Job + Download + Admin UI Trigger)

Status: IN IMPLEMENTATION (CODE READY)  
Datum: 2026-01-02  
Commit(s): _(nach Commit eintragen)_

---

## Ziel
GoLive-tauglicher CSV Export Flow (ONLINE-only, Phase 1):
- Admin kann Export starten (Job)
- Job-Status (Polling)
- CSV Download (text/csv)
- Dev Storage Stub: `.tmp_exports/<tenantId>/<jobId>.csv`
- Tenant-scope & leak-safe (falscher Tenant/ID => 404)
- Standard Responses: jsonOk/jsonError + traceId + x-trace-id

---

## Umsetzung (Highlights)
- **ExportJob** wird beim Create auf `QUEUED` gesetzt und sofort best-effort verarbeitet:
  - `RUNNING` + `startedAt`
  - `DONE` + `finishedAt` + `resultStorageKey`
  - `FAILED` bei Fehlern (inkl. minimalem error hint in params)
- **CSV Format (MVP)** stabil & robust:
  - UTF-8 + BOM, Delimiter `;`
  - Spalten: leadId, formId, capturedAt, isDeleted, deletedAt, deletedReason, values_json
- **Storage Stub**:
  - sichere relative Keys (Traversal-Schutz)
  - Download streamed als `text/csv; charset=utf-8`

---

## Dateien/Änderungen
API:
- `src/app/api/admin/v1/exports/route.ts`
- `src/app/api/admin/v1/exports/csv/route.ts`
- `src/app/api/admin/v1/exports/[id]/route.ts`
- `src/app/api/admin/v1/exports/[id]/download/route.ts`

Lib:
- `src/lib/csv.ts`
- `src/lib/storage.ts`
- `src/lib/tenantContext.ts`
- `src/lib/exportCsv.ts`

Admin UI:
- `src/app/(admin)/admin/exports/page.tsx`
- `src/app/(admin)/admin/exports/ExportsClient.tsx`
- `src/app/(admin)/admin/exports/ExportCreateModal.tsx`
- `src/app/(admin)/admin/exports/exports.types.ts`

Docs:
- `docs/LeadRadar2026A/03_API.md`
- `docs/LeadRadar2026A/04_ADMIN_UI.md`
- `docs/teilprojekt-1.8-exports-csv.md`

---

## Akzeptanzkriterien – Check
- [x] CSV Job Create funktioniert (tenant-scoped)
- [x] Job List + Status funktionieren
- [x] Download liefert CSV Datei (text/csv)
- [x] UI Exports Screen polished (states + polling + download)
- [x] traceId sichtbar in errors
- [ ] typecheck/lint/build grün (nach Commit prüfen)
- [ ] Doku + Schlussrapport committed, git status clean

---

## Tests/Proof (reproduzierbar)

### Local Dev
```bash
cd /d/dev/leadradar2026a
npm run dev

