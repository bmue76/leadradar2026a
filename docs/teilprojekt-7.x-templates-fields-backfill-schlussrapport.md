# Schlussrapport — Teilprojekt 7.x: Templates → Create-Form Robustness + Fields Backfill Tooling

Status: DONE ✅  
Datum: 2026-02-14  
Branch: main

## Ziel

- Erstellen eines Formulars aus einer Vorlage (Template/FormPreset) muss **robust** funktionieren, auch wenn ältere Presets keine `config.fields` enthalten.
- Tooling, um Presets zu prüfen (Missing Fields) und bei Bedarf Felder aus Source-Form zu backfillen.
- Repo wieder **grün** (typecheck/lint/build).

## Umsetzung

### 1) API: `/api/admin/v1/templates/[id]/create-form`
- Implementiert: **Field-Extraction** aus Template-Config (direct + deep search).
- Fallback: Wenn keine Fields im Config gefunden werden, wird (falls vorhanden) `sourceFormId`/`formId` verwendet und die Felder werden aus `formField` der Source-Form geladen.
- Guardrails:
  - Abbruch mit `TEMPLATE_INVALID`, wenn keine Felder ermittelbar sind.
  - Duplicate-Key Check (`DUPLICATE_FIELD_KEY`).
  - Sortierung über `sortOrder` + key.

### 2) Scripts (DEV Tooling)
- `scripts/list-templates-missing-fields.js`
  - Listet Presets/Templates, bei denen `config.fields` fehlt oder leer ist.
- `scripts/backfill-template-fields.js`
  - Backfill von `config.fields` aus Source-Form (`sourceFormId`/`formId`).
  - Default: Dry-Run, optional `--apply`.

### 3) Builder: Save as Template
- Save-as-Template/Preset speichert eine **V1 Preset-Config** inkl. `fields` Snapshot konsistent (Basis für robustes Create-Form).

### 4) Repo Hygiene
- `.gitignore` erweitert: gezieltes Tracken der beiden `.js` Tooling-Scripts trotz `scripts/*` Ignore-Regel.

## Tests / Checks

- `node scripts/list-templates-missing-fields.js`  
  Ergebnis: `Done. Missing fields: 0 / 6`
- `node scripts/backfill-template-fields.js` (dry-run)  
  Ergebnis: keine Kandidaten (keine Backfills nötig)
- `node scripts/backfill-template-fields.js --apply`  
  Ergebnis: keine Kandidaten (keine Änderungen nötig)
- `npm run typecheck` ✅  
- `npm run lint` ✅  
- `npm run build` ✅  

## Ergebnis

- Template → Create-Form ist stabil gegen alte/inkonsistente Presets.
- Tooling vorhanden, um Bestandsdaten zu prüfen und (falls nötig) zu reparieren.
- Projektstatus wieder grün.

## Offene Punkte

- Keine P0/P1 offen.

