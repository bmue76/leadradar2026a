# Schlussrapport — Teilprojekt 5.7: Betrieb Leads Admin UI — Drawer, Review, Notizen via Meta

Datum: 2026-02-02  
Status: DONE ✅  
Git: 9e5666f (feat) + Folgecommit(s) für Rest-Files

## Ziel

- Admin-Seite `/admin/leads` GoLive-ready machen: stabile Liste + Drawer-Detail.
- Review-Status (Neu/Bearbeitet) MVP-lean ohne Migration umsetzen.
- Interne Notizen beim Lead erfassen, MVP-lean über `Lead.meta`.
- Typecheck/Lint/Build grün.

## Umsetzung

### Admin UI — Leads
- Leads-Liste mit:
  - Suche (Name/Firma/E-Mail/Telefon)
  - Status-Filter (Alle/Neu/Bearbeitet)
  - Sortierung (Neueste/Älteste/Name)
  - Cursor-Pagination (“Mehr laden”)
  - Aktives Event als Standardfilter (GoLive-safe)
- Drawer-Detail:
  - Kontaktfelder editierbar (Vorname/Nachname/Firma/E-Mail/Telefon/Mobile)
  - Notizen Feld (intern)
  - Meta/Quelle Anzeige (Event/Form/Device/Erfasst/Status)
  - Review Toggle (als bearbeitet / als neu markieren)
  - Anhänge/OCR Preview inkl. Download und OCR Aktionen (laden/anwenden)
- Fehler-States konsistent (List/Drawer/OCR) inkl. TraceId Anzeige.

### API — Leads
- `GET /api/admin/v1/leads`
  - Query Contract: `q`, `status`, `event`, `sort`, `dir`, `take`, `cursor`
  - GoLive-safe: `event=ACTIVE` ohne aktives Event => leere Liste (kein Error)
  - Review-Status abgeleitet aus `Lead.meta.reviewedAt` (ISO)
- `POST /api/admin/v1/leads/:id/review`
  - Setzt oder entfernt `meta.reviewedAt`
  - Leak-safe tenant scoped
- Lead Detail Route wurde bei Bedarf angepasst, damit Drawer stabil arbeitet.

## Datenmodell MVP

- Review-Status:
  - `Lead.meta.reviewedAt` (ISO String)
- Notizen:
  - `Lead.meta.adminNotes` (String)

## Dateien

- `src/app/(admin)/admin/leads/LeadsClient.tsx`
- `src/app/(admin)/admin/leads/page.tsx`
- `src/app/api/admin/v1/leads/route.ts`
- `src/app/api/admin/v1/leads/[id]/route.ts`
- `src/app/api/admin/v1/leads/[id]/review/route.ts`

## Akzeptanzkriterien

- ✅ `npm run typecheck` grün
- ✅ `npm run lint` grün
- ✅ `npm run build` grün
- ✅ `/admin/leads` funktioniert auch ohne aktives Event (leere Liste, keine Crashes)
- ✅ Review Toggle persistiert (Neu/Bearbeitet)
- ✅ Notizen speicherbar (MVP via meta)

## Proof

- Lokal:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
- Manuell:
  - `/admin/leads` öffnen
  - Lead öffnen, Review toggeln, Reload => Status bleibt
  - Notiz speichern, Reload => Notiz bleibt
