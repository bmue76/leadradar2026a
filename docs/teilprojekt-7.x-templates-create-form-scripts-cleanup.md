# Schlussrapport — Teilprojekt 7.x: Templates → Create-Form Fallback + Backfill-Tooling + Script-Cleanup (GoLive MVP)

Status: DONE ✅  
Datum: 2026-02-14  
Commit(s):
- `0e61d52` — feat(tp7.x): templates create-form fallback + scripts backfill tooling
- (dieser Report) — docs(tp7.x): schlussrapport templates create-form + scripts cleanup

## Ziel

1) **Formular aus Vorlage erstellen** muss robust funktionieren – auch wenn ältere Vorlagen **keine `config.fields`** gespeichert haben.  
2) Tooling bereitstellen, um Vorlagen zu prüfen und ggf. rückwirkend zu reparieren (Backfill).  
3) Repo sauber halten: Skripte **tracken**, aber weiterhin keine „random“ Scripts/Artefakte einchecken.

## Ausgangslage / Problem

- Beim POST `POST /api/admin/v1/templates/[id]/create-form` kam ein 400:
  - `TEMPLATE_INVALID: Template has no fields (config.fields missing).`
- Ursache: Ältere Presets/Vorlagen hatten **kein `config.fields`** (z.B. nur `sourceFormId` / `formId` oder andere Struktur).
- Zusätzlich: lokale Node-Scripts hatten Prisma-Init-Probleme wegen falscher PrismaClient-Optionen (z.B. `datasourceUrl`, `datasources` / leere Options).

## Umsetzung

### 1) API: templates/[id]/create-form robust machen
Datei: `src/app/api/admin/v1/templates/[id]/create-form/route.ts`

**Neues Verhalten:**
- Felder werden zuerst aus `preset.config` extrahiert:
  - **Preferred**: `config.fields`
  - **Backward compat**: `config.fieldsSnapshot`
  - **Robust**: Deep-Search nach typischen Keys (`fields`, `fieldsSnapshot`, `formFields`, `schemaFields`) bis Depth 5
- Falls keine Felder gefunden werden:
  - Fallback: wenn `config.sourceFormId` oder `config.formId` vorhanden ist → **FormFields aus DB laden** (nur wenn Tenant-Ownership passt).
- Wenn danach immer noch keine Felder → sauberer 400 `TEMPLATE_INVALID`.

**Guardrails:**
- `assertUniqueKeys()` verhindert doppelte Field-Keys.
- FieldType wird über `parseFieldType()` validiert, default `TEXT`.

### 2) Tooling: Diagnose & Backfill
Neue Dateien:
- `scripts/list-templates-missing-fields.js`
- `scripts/backfill-template-fields.js`

**list-templates-missing-fields**
- Zweck: Übersicht, ob es Presets ohne `config.fields` gibt
- Ergebnis (aktueller Stand): `Missing fields: 0 / 6`

**backfill-template-fields**
- Zweck: `config.fields` aus dem Source-Form (via `sourceFormId` / `formId`) nachtragen
- Mode:
  - Dry-run: `node scripts/backfill-template-fields.js`
  - Apply: `node scripts/backfill-template-fields.js --apply`
- Safety:
  - Presets ohne `tenantId` (Public) werden **geskippt**, weil Ownership des Source-Forms nicht zuverlässig ermittelbar ist.

### 3) Repo Hygiene (.gitignore)
- Standard: `scripts/*` bleibt ignoriert (damit kein Tooling-Müll reinkommt)
- Ausnahme: die gezielt erlaubten Skripte sind tracked (Backfill/Check + vorhandene Smoke-Scripts)

## Migration / DB
- Neue Migration eingecheckt:
  - `prisma/migrations/20260212213524_tp7_0_form_presets/`

## Verifikation (grün)

✅ API
- Create-Form aus Template funktioniert auch bei fehlenden `config.fields` via Fallback (sourceFormId → DB).

✅ Scripts
- `node scripts/list-templates-missing-fields.js` → `Missing fields: 0 / 6`
- `node scripts/backfill-template-fields.js` → candidates 0 (dry-run & apply)

✅ Quality Gates
- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Ergebnis / Mehrwert

- „Formular aus Vorlage“ ist **abwärtskompatibel** und bricht nicht mehr bei alten Template-Strukturen.
- Tooling vorhanden, um problematische Presets sichtbar zu machen und tenant-owned Templates automatisch zu reparieren.
- Repo bleibt clean: Scripts werden kontrolliert versioniert, Rest bleibt ignoriert.

## Offene Punkte / Notizen

- Public Presets (`tenantId = null`) werden beim Backfill bewusst übersprungen → falls jemals nötig: manuell migrieren oder Public-Preset-Ownership-Konzept definieren.
- Langfristig: sicherstellen, dass **neue Presets immer `config.fields`** enthalten (Save-as-Template Flow bleibt Source of Truth).
