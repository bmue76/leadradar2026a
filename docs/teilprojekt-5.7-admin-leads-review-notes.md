# Schlussrapport — Teilprojekt 5.7: Admin Leads — Review-Status + Notizen (MVP, meta-based)

Datum: 2026-02-02  
Status: DONE ✅  
Git: <BITTE_COMMIT_HASH_EINTRAGEN>

## Ziel

- Admin-Leads-Liste für den GoLive stabilisieren und auf “Apple-clean” bringen.
- Review-Status (Neu/Bearbeitet) ohne DB-Migration implementieren (MVP-lean via `Lead.meta.reviewedAt`).
- Interne Notizen im Lead erfassen (MVP-lean via `meta.adminNotes`).
- Leaksafe Tenant-Scope beibehalten (404 “Not found.” bei Fremd-Tenant-IDs).

## Umsetzung / Änderungen

### Admin UI
- Leads-Liste mit Filters (Status / Suche / Sortierung), Pagination (“Mehr laden”).
- Drawer-Detail: Kontaktfelder editierbar, Notizen, Meta/Quelle, Review Toggle.
- OCR/Attachment Preview & Download (via bestehende Routes).
- Error-States sauber (List/Drawer/OCR) inkl. TraceId-Anzeige.
- TS/Lint Fixes, sodass `npm run typecheck`, `npm run lint`, `npm run build` grün sind.

### API
- `GET /api/admin/v1/leads` erweitert:
  - Query Contract: `q`, `status`, `event`, `sort`, `dir`, `take`, `cursor` (+ backward compat).
  - Review-Status abgeleitet aus `meta.reviewedAt`.
  - GoLive-safe: `event=ACTIVE` ohne aktives Event => leere Liste (kein Error).
- `POST /api/admin/v1/leads/:id/review`:
  - Setzt/entfernt `meta.reviewedAt` (ISO) leak-safe tenant-scoped.

## Dateien

- `src/app/(admin)/admin/leads/LeadsClient.tsx`
- `src/app/api/admin/v1/leads/route.ts`
- `src/app/api/admin/v1/leads/[id]/review/route.ts`

## Akzeptanzkriterien

- ✅ `npm run typecheck` grün
- ✅ `npm run lint` grün (Warnings nur, wenn bewusst toleriert)
- ✅ `npm run build` grün
- ✅ Leads-Liste lädt stabil (auch wenn kein aktives Event existiert)
- ✅ Review-Status (Neu/Bearbeitet) kann im Drawer gesetzt/entfernt werden
- ✅ Fehler zeigen nachvollziehbare Meldung + TraceId

## Proof (lokal)

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Manuell: `/admin/leads` öffnen, Lead selektieren, Review toggeln, Reload => Status bleibt.

## Offene Punkte / Next

- TP 5.8: Export (CSV) direkt aus Leads-Liste (Filter + optional Auswahl).
- Optional: `<img>` Preview auf `next/image` umstellen oder Lint-Regel scoped unterdrücken (nur falls gewünscht).
