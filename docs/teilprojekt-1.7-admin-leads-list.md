# Teilprojekt 1.7: Admin Screen — Leads List (UI + Filter + Cursor Paging + Detail)

Status: IN REVIEW (nach lokalen Quality Gates → DONE)  
Datum: 2026-01-02

## Ziel
Kundentaugliche Leads-Übersicht unter **/admin/leads** auf Basis der bestehenden Admin Leads Contracts (TP 1.6):
- Liste + Cursor Paging (Load more)
- Filter: Form, Show deleted, optional Date range
- Detail Drawer (ohne neue Page): Values + Attachments (Download später)
- Actions: Soft-delete, Restore optional (falls Endpoint existiert)
- UX States: Loading Skeleton, Empty, Error (traceId + Retry)

## Umsetzung (Highlights)
- **LeadsClient**: Filter-State, Cursor Paging, Forms Map (GET /forms), List Fetch (GET /leads)
- **LeadsTable**: Polished Table, Deleted Badge, Preview heuristisch (company/email/name…)
- **LeadDetailDrawer**: Detail Fetch (GET /leads/:id), Actions Delete (DELETE), Restore (POST /restore optional)
- **Error UX**: freundlich, traceId sichtbar + Copy + Retry

## Dateien/Änderungen
- src/app/(admin)/admin/leads/page.tsx
- src/app/(admin)/admin/leads/LeadsClient.tsx
- src/app/(admin)/admin/leads/LeadsTable.tsx
- src/app/(admin)/admin/leads/LeadDetailDrawer.tsx
- src/app/(admin)/admin/leads/leads.types.ts

## Akzeptanzkriterien – Check
- [ ] Screen lädt ohne Errors
- [ ] Filter funktionieren reproduzierbar
- [ ] Cursor paging (Load more) funktioniert
- [ ] Detail Drawer zeigt values & attachments
- [ ] Delete funktioniert
- [ ] Restore funktioniert (falls Endpoint vorhanden) / sonst freundliche Meldung
- [ ] Loading/Empty/Error polished (traceId+Retry)
- [ ] npm run typecheck/lint/build grün

## Tests/Proof (reproduzierbar)
### UI
- npm run dev
- http://localhost:3000/admin/leads

### API sanity
- curl -i -H "x-tenant-slug: atlex" "http://localhost:3000/api/admin/v1/leads?limit=10"
- curl -i -H "x-tenant-slug: atlex" "http://localhost:3000/api/admin/v1/forms"

## Offene Punkte/Risiken
- P1: Restore Endpoint ist optional. UI behandelt fehlenden Endpoint freundlich.
- P1: Attachments Download ist bewusst disabled ("coming later") → TP 1.8/Storage/Exports.

## Next Step
TP 1.7 finalisieren: lokale Quality Gates + Commit/Push + Masterchat-Rückgabe.  
Danach: **TP 1.8 — Exports CSV (Job + Download + UI Trigger)**.
