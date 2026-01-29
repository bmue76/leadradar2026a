# Schlussrapport — Teilprojekt 4.12: Admin Lead Drawer — OCR Panel Polish + Hooks Fix

Datum: 2026-01-29  
Status: DONE ✅  
Git:
- `00745f0` — ui(tp4.12): polish admin lead drawer OCR panel
- `377956d` — fix(tp4.12): fix hooks order in LeadDetailDrawer

> Hinweis: Mobile-Kamera/Capture wurde später wieder zurückgebaut. TP 4.12 betrifft ausschliesslich Admin (Lead Drawer / OCR Panel) und bleibt davon unberührt.

---

## Zielbild
Im Admin kann ein Lead im Drawer geöffnet werden und – falls eine Visitenkarten-Image-Attachment + OCR vorhanden ist – kann:
- der OCR-Status sauber angezeigt werden
- das Attachment als Preview angezeigt und heruntergeladen werden
- Raw-Text eingesehen (Expand/Collapse)
- Parsed/Corrected Contact angezeigt und manuell korrigiert werden
- Correction gespeichert werden
- OCR Contact ins Lead-Kontaktprofil (contact_*) übernommen werden (Apply)
- Fehler/traceId transparent angezeigt und kopiert werden

Zusätzlich: keine React Hook Order Fehler / keine Runtime Errors.

---

## Umsetzung (Scope)
### 1) OCR Panel im LeadDetailDrawer
- OCR-Status-Pill (Pending/Completed/Failed) + Engine/Version/Confidence (optional)
- Reload OCR (GET) mit sauberem Error/traceId State
- Attachment Preview (inline) + Download Link (attachment)
- Raw Text Panel mit Expand/Collapse
- Parsed/Corrected Contact UI:
  - Draft-Editing (Inputs)
  - Reset auf “effective” (correctedContact bevorzugt, sonst parsedContact)
  - Save Correction (PATCH)
  - Apply OCR to Lead Contact (POST) inkl. Busy-States

### 2) Hook Order Bugfix
- Behebung von “Rendered more hooks than during the previous render” / “useMemo called conditionally”
- Sicherstellung: Hooks werden in jedem Render in gleicher Reihenfolge aufgerufen (keine Hooks nach einem early-return / keine conditional Hook Calls).

---

## Betroffene Files
- `src/app/(admin)/admin/leads/LeadDetailDrawer.tsx`

---

## Verwendete API Endpoints
- `GET  /api/admin/v1/leads/:id`
- `DELETE /api/admin/v1/leads/:id` (Soft-delete)
- `POST /api/admin/v1/leads/:id/restore` (optional / env-abhängig)
- `GET  /api/admin/v1/leads/:id/ocr`
- `PATCH /api/admin/v1/leads/:id/ocr` (save correction)
- `POST /api/admin/v1/leads/:id/ocr/apply` (apply to contact_*)
- `GET  /api/admin/v1/leads/:id/attachments/:attachmentId/download`
  - `?disposition=inline` für Preview

---

## QA / Checks
### Commands
- `npm run typecheck`
- `npm run lint`
- `npm run build`

### Manuelle Checks (Admin)
- Admin → Leads → Open Drawer:
  - Drawer öffnet stabil (kein Hook-Order Fehler in Console)
  - OCR Panel zeigt Status/Engine/Attachment/Raw-Text
  - Reload funktioniert (inkl. Fehlerpanel + traceId Copy)
  - Save Correction speichert und lädt neu
  - Apply übernimmt in contact_* Felder und Drawer zeigt aktualisierte Contact-Daten

---

## Ergebnis
- OCR Panel im Lead Drawer ist “Apple-clean”, robust und transparent (Status/Errors/traceId)
- Hooks/Runtime Fehler sind behoben

---

## Known Limitations / Notes
- OCR Panel hängt vom Vorhandensein eines Business-Card Attachments und einem OCR Result ab:
  - Ohne Attachment → klarer Hinweis “No business card image attachment…”
  - Ohne OCR Result → Hinweis + Reload Call-to-action
- Restore bleibt optional (abhängig von API-Verfügbarkeit in der Umgebung)

---

## Nächste Schritte (optional)
- Admin “Re-run OCR” (serverseitig) als explizite Aktion (falls gewünscht)
- Qualitäts-Iteration OCR-Parsing/Mapping (Felder, Heuristiken, Länder/Telefonformate)
- Einheitliche OCR/Attachment Typen weiter härten (Contract & UI)

