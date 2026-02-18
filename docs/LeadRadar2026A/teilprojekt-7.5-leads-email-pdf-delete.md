# Teilprojekt 7.5 – Leads: E-Mail / PDF / Delete (inkl. TP 7.5.1)

## Ziel
Leads in der Admin UI sollen:
- immer sichtbar/auswertbar sein (auch aus archivierten Events)
- pro Lead per E-Mail weiterleitbar sein (Content + optional values)
- pro Lead als PDF-Rapport downloadbar sein
- pro Lead löschbar sein (DSGVO/GDPR: „Right to erasure“)

## Scope
### UI
- /admin/leads folgt dem Page Layout Standard (wie /admin)
- Filter: Review-Status, Suche, Sortierung
- EventScope: Default = ALL (optional „Nur aktives Event“)
- Drawer:
  - speichern (Kontakt/Notizen)
  - als bearbeitet markieren
  - E-Mail weiterleiten
  - PDF-Rapport downloaden
  - Lead löschen (Confirm)

### API
- GET /api/admin/v1/leads/[id]/pdf -> PDF (pdf-lib)
- POST /api/admin/v1/leads/[id]/delete -> Delete (best-effort cascade, gate via lead-detail)

## Acceptance Criteria
- Layout: Content links/rechts bündig wie Topbar (kein zusätzlicher Einzug / keine Center-Max-Width)
- Leads default: alle Leads sichtbar (nicht nur ACTIVE event)
- PDF: Download funktioniert und enthält Meta + Kontakt + Notizen + values (default)
- Delete: Lead kann gelöscht werden; danach ist er nicht mehr in der Liste sichtbar
- Fehlerstates: sauber mit traceId

## Datenschutz (Kurz)
- Datenminimierung: nur Felder erfassen, die wirklich nötig sind
- Transparenz: Kunde muss Endkunden informieren, wofür Leads verwendet werden
- Löschung: Admin kann Leads löschen (manuell); später: Retention Policy pro Tenant/Event
- Export: Möglichkeit, Daten jederzeit herauszugeben (Exports)
