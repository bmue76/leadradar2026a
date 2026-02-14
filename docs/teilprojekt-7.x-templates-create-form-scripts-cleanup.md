# Schlussrapport — Teilprojekt 7.x: Templates → Create-Form Robustness + Script-Bereinigung

Status: DONE ✅  
Datum: 2026-02-14  
Scope: GoLive MVP

## Ziel

- **Create Form from Template** muss auch dann funktionieren, wenn ältere Templates **keine `config.fields`** enthalten.
- **Scripts** zur Template-Qualität/Bereinigung sollen lokal zuverlässig laufen (ohne Prisma-Constructor Hacks) und als Quality-Gate dienen.

## Umsetzung

### 1) API: `/api/admin/v1/templates/[id]/create-form`
Robuste Feld-Ermittlung in folgender Reihenfolge:

1. **Direkt** aus Template-Config lesen:
   - `config.fields` (preferred)
   - `config.fieldsSnapshot` (backward compat)
2. **Deep search** in `config` (maxDepth) nach möglichen Field-Arrays
3. **Fallback**: falls `config.sourceFormId` / `config.formId` vorhanden:
   - Felder aus `formField` der Source-Form laden (Tenant-Ownership wird geprüft)

Guardrails:
- `FieldType` wird auf gültige Prisma-Enummember normalisiert, sonst `TEXT`
- `sortOrder` wird deterministisch gesetzt
- `key` muss eindeutig sein (`DUPLICATE_FIELD_KEY`)

### 2) Scripts
- `scripts/list-templates-missing-fields.js`
  - Reportet Templates ohne `config.fields`
  - Ergebnis aktuell: **Missing fields: 0 / n**
- `scripts/backfill-template-fields.js`
  - Backfill von `config.fields` aus der Source-Form (`sourceFormId/formId`)
  - Public Presets (`tenantId=null`) werden bewusst übersprungen (Ownership unklar)
  - Dry-run & Apply verfügbar:
    - `node scripts/backfill-template-fields.js`
    - `node scripts/backfill-template-fields.js --apply`

## Verifikation

### Repro / Proof (lokal)
```bash
node scripts/list-templates-missing-fields.js
node scripts/backfill-template-fields.js
node scripts/backfill-template-fields.js --apply

npm run typecheck
npm run lint
npm run build
Ergebnis:

list-templates-missing-fields → Missing fields: 0 / n

Backfill → 0 candidates (System ist clean)

typecheck, lint, build → grün

Ergebnis
Template → Create-Form ist rückwärtskompatibel und blockiert nicht mehr bei fehlendem config.fields.

Scripts sind sauber und liefern eine klare Qualitätssicht auf Template-Daten.

GoLive MVP: stabiler, weniger Supportfälle bei historischen Templates.

Notes / Risiken
Public Templates (tenantId=null) werden beim Backfill übersprungen, weil die Source-Form-Ownership nicht eindeutig ist.

Deep-Search ist bewusst defensiv (maxDepth), um Performance/Komplexität zu begrenzen.

