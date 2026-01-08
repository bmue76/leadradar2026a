# Teilprojekt 2.8 — FieldTypes + Builder Properties End-to-End (SELECT/CHECKBOX/EMAIL/PHONE) + Demo Capture + Mobile + Export Proof

Status: IN PROGRESS (Proof + Docs-Finalisierung offen)  
Datum: 2026-01-08  
Commits:
- c847ec5 feat(fields): normalize select/checkbox config + defaults (tp 2.8)
- 4641b91 feat(builder): add realistic preview + safe select defaults (tp 2.8)

## Ziel

FieldTypes und Properties produktfähig End-to-End unterstützen:

- FieldTypes: TEXT, TEXTAREA, EMAIL, PHONE, SINGLE_SELECT, MULTI_SELECT, CHECKBOX
- Builder Properties stabil:
  - Type wechseln mit sinnvollen Defaults (insb. SELECT nicht “leer”)
  - SELECT: Options Editor (1 Option pro Zeile), persistiert in FormField.config
  - CHECKBOX: Default (true/false), persistiert in FormField.config
  - Placeholder + HelpText konsistent
  - Required + Active konsistent
- Preview + Capture:
  - Builder Preview rendert realistische Inputs/Select/Checkbox (read-only)
  - Demo Capture rendert Types korrekt und erstellt Leads via Mobile API v1
- Proof bis Export:
  - Lead.values enthält Werte inkl. select/checkbox
  - Admin Leads zeigt values
  - CSV Export enthält values_json

## Umsetzung (Highlights)

### DB / Prisma
- Keine DB-Änderung nötig.
- FieldType Enum ist bereits erweitert (EMAIL/PHONE/SINGLE_SELECT/MULTI_SELECT/CHECKBOX).
- FormField hat placeholder/helpText/config bereits vorhanden.

### API (Admin)
- POST /api/admin/v1/forms/:id/fields und PATCH /api/admin/v1/forms/:id/fields/:fieldId:
  - Normalisierung von SELECT-Options:
    - akzeptiert config.options (array) und config.optionsText (textarea)
    - persistiert als config.options: string[]
  - Normalisierung CHECKBOX Default:
    - akzeptiert defaultValue/defaultBoolean/checkboxDefault
    - persistiert als config.defaultValue: boolean
  - Null-Handling: config null wird korrekt “cleared” (DbNull) oder omitted.

### UI (Builder)
- Properties Panel:
  - Type Dropdown: TEXT/TEXTAREA/EMAIL/PHONE/SINGLE_SELECT/MULTI_SELECT/CHECKBOX
  - SELECT: Options textarea (1 pro Zeile)
  - CHECKBOX: Default checked toggle
  - Placeholder + HelpText Inputs
- Guardrail: Beim Wechsel zu SELECT wird optionsText automatisch “Option 1” gesetzt, um leere Options zu vermeiden.
- Preview Panel:
  - Realistische Darstellung pro FieldType (read-only)
  - Preview merged Draft (selected field) über bestehende Field-Daten

### Demo Capture
- Rendert FieldTypes realistisch:
  - TEXT/TEXTAREA/EMAIL/PHONE als input/textarea
  - SINGLE_SELECT / MULTI_SELECT als select
  - CHECKBOX als checkbox
- Submit typisiert:
  - CHECKBOX -> boolean
  - SELECT -> string / string[]
  - TEXT/TEXTAREA/EMAIL/PHONE -> string
- Speichert über Mobile API v1 (/api/mobile/v1/leads) in Lead.values.

## Dateien / Änderungen

- src/app/api/admin/v1/forms/[id]/fields/route.ts
- src/app/api/admin/v1/forms/[id]/fields/[fieldId]/route.ts
- src/app/(admin)/admin/demo/capture/CaptureClient.tsx
- src/app/(admin)/admin/forms/[id]/_components/builderV2/BuilderV2.tsx
- docs/teilprojekt-2.8-fieldtypes-e2e.md

## Akzeptanzkriterien — Check

- [x] FieldTypes: TEXT/TEXTAREA/EMAIL/PHONE/SINGLE_SELECT/MULTI_SELECT/CHECKBOX end-to-end (Model + UI + Capture)
- [x] SELECT options editierbar, persistiert in config, gerendert in preview/capture
- [x] CHECKBOX default editierbar, persistiert, gerendert
- [x] Demo Capture submit funktioniert (Mobile API v1), Werte typisiert (bool/string/string[])
- [x] Mobile lead create kompatibel (values_json)
- [ ] Admin Leads: Werte sichtbar (manueller Proof ausstehend)
- [ ] CSV Export: values_json korrekt (manueller Proof ausstehend)
- [ ] Quality Gates: typecheck/lint/build (Proof ausstehend)
- [ ] Docs Masterfiles (03_API/04_ADMIN_UI) aktualisiert (ausstehend)

## Tests / Proof (reproduzierbar)

### Quality Gates
```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build

