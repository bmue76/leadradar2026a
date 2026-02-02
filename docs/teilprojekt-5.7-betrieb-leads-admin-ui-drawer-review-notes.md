# Schlussrapport — Teilprojekt 5.7: Betrieb → Leads Admin UI (Liste + Drawer + Review + Notizen via Meta) — ONLINE-only (GoLive MVP)

Datum: 2026-02-02  
Status: DONE ✅  
Commit(s):
- 9e5666f — feat(tp5.7): leads admin ui (list + drawer + review + notes via meta)
- FOLGECOMMIT_1 — (falls vorhanden) …
- FOLGECOMMIT_2 — (falls vorhanden) …

## Ziel
- Admin-Seite `/admin/leads` GoLive-ready machen: stabile Liste + Drawer-Detail.
- Review-Status (Neu/Bearbeitet) MVP-lean ohne Migration umsetzen.
- Interne Notizen beim Lead erfassen, MVP-lean über `Lead.meta`.
- Typecheck/Lint/Build grün.

## Umsetzung (Highlights)

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
  - Tenant-scoped, leak-safe
- Lead Detail Route bei Bedarf angepasst, damit Drawer stabil arbeitet.

## Datenmodell (MVP, ohne Migration)
- Review-Status: `Lead.meta.reviewedAt` (ISO String)
- Notizen: `Lead.meta.adminNotes` (String)

## Dateien / Änderungen
- `src/app/(admin)/admin/leads/LeadsClient.tsx`
- `src/app/(admin)/admin/leads/page.tsx`
- `src/app/api/admin/v1/leads/route.ts`
- `src/app/api/admin/v1/leads/[id]/route.ts`
- `src/app/api/admin/v1/leads/[id]/review/route.ts`

## Akzeptanzkriterien — Check ✅
- [x] `npm run typecheck` grün
- [x] `npm run lint` grün
- [x] `npm run build` grün
- [x] `/admin/leads` funktioniert auch ohne aktives Event (leere Liste, keine Crashes)
- [x] Review Toggle persistiert (Neu/Bearbeitet)
- [x] Notizen speicherbar (MVP via meta)

## Tests/Proof (reproduzierbar)

### Commands
```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build
API Smoke (optional)
List:

bash
Code kopieren
curl -i -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/leads?event=ACTIVE&status=ALL&take=50"
Review toggle:

bash
Code kopieren
curl -i -X POST -H "cookie: lr_session=DEIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"reviewed":true}' \
  "http://localhost:3000/api/admin/v1/leads/LEAD_ID/review"
UI Smoke
/admin/leads öffnen

Lead öffnen → Review toggeln → Reload → Status bleibt

Notiz speichern → Reload → Notiz bleibt

Ohne aktives Event: Liste bleibt leer, keine Errors

Offene Punkte / Risiken
P1: Lead.meta bleibt MVP-lean; später evtl. echte Felder reviewedAt/adminNotes modellieren (Migration) für bessere Querybarkeit/Audit.

Next Step
TP 5.8: Betrieb → Exports UI (CSV) + Export Jobs Übersicht + “Export mit Filter (Active Event)” (GoLive-Workflow abschliessen).
