Schlussrapport — Teilprojekt 4.11: Admin OCR Review + CSV Contract (Lead Export)

Datum: 2026-01-28
Status: DONE ✅
Git (main):

eb67bee — feat(tp4.11): admin ocr review api

5564087 — feat(tp4.11): csv contract + leads export mapping

5d0e391 — ui(tp4.11): polish lead drawer ocr review panel

(optional Fix) 3192ee7 — fix(tp4.11): prisma validator import

Ziel

Admin kann OCR Result pro Lead (Business Card) im Lead Drawer einsehen, korrigieren und anwenden.

CSV Export ist contract-basiert (stabile Spalten inkl. contact_* + ocr_* Meta) und mapping ist robust.

Umsetzung
1) Admin OCR Review API

Alle Responses im Standard: jsonOk/jsonError inkl. traceId im Body + x-trace-id Header.

GET /api/admin/v1/leads/:id/ocr

liefert { attachment, ocr } für OCR Panel (Attachment Preview + Raw Text + Contact JSON)

leak-safe (falscher Tenant/ID => 404)

PATCH /api/admin/v1/leads/:id/ocr

speichert correctedContactJson (Admin-Korrektur)

POST /api/admin/v1/leads/:id/ocr/apply

schreibt Contact auf lead.contact_*

setzt Meta: contactSource, contactUpdatedAt, contactOcrResultId

2) CSV Contract + Export Mapping

CSV Contract in docs/LeadRadar2026A/07_CSV_CONTRACT.md (stabile Spalten)

Export Mapping im Backend vereinheitlicht:

contact_* direkt aus Lead.contact*

ocr_* aus dem „applied“ OCR Result via Lead.contactOcrResultId

dynamische field_* aus Lead.values (Keys normalisiert + deterministisch bei Kollisionen, z. B. _2, _3)

Lint-Fix: kein any / saubere Typen / Prisma validator korrekt importiert

3) Admin UI — Lead Detail Drawer OCR Panel

Datei: src/app/(admin)/admin/leads/LeadDetailDrawer.tsx

OCR Panel mit Status/Engine Meta, Attachment Preview, Raw Text, Correction Form

„Save“ nur bei Änderungen (dirty)

„Apply“ nur wenn status=COMPLETED

Busy/Loading/Error States inkl. traceId Copy

Key Files (Einstiegspunkte)

src/app/api/admin/v1/leads/[id]/ocr/route.ts (GET/PATCH)

src/app/api/admin/v1/leads/[id]/ocr/apply/route.ts (POST apply)

src/app/api/admin/v1/exports/leads/route.ts (CSV Export)

src/lib/exportCsv.ts oder entsprechendes Mapping/Contract-Modul (falls vorhanden)

src/app/(admin)/admin/leads/LeadDetailDrawer.tsx

docs/LeadRadar2026A/07_CSV_CONTRACT.md

Definition of Done (DoD)

✅ npm run typecheck

✅ npm run lint

✅ npm run build

✅ leak-safe (404 bei falschem Tenant/ID)

✅ Standard Responses + traceId

✅ UI States: Loading/Empty/Error sauber

✅ CSV Output entspricht Contract (stabile Spalten)

Quick Test (Manual)

Lead mit BUSINESS_CARD_IMAGE Attachment erstellen (Mobile Scan oder Upload Flow).

Admin → Leads → Lead öffnen → OCR Panel:

Preview sichtbar

Raw Text sichtbar

Parsed Contact sichtbar

Kontakt korrigieren → Save → Reload → correctedContact angezeigt.

Apply → Contact Section zeigt contact_* gefüllt + Applied OCR Result Id.

Export CSV erstellen → Download → Spalten contact_* + ocr_* vorhanden.

Ergebnis

TP 4.11 ist abgeschlossen: OCR Review im Admin stabil nutzbar, CSV Export contract-sicher und UI ist Apple-clean mit klaren States.