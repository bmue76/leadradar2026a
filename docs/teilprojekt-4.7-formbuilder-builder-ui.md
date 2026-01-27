# Schlussrapport — Teilprojekt 4.7: Formbuilder (Builder UI)

Datum: 2026-01-27
Status: DONE ✅

## Ziel
Ein praxistauglicher Formbuilder im Admin:
- Felder aus Bibliothek hinzufügen (Click oder Drag’n’Drop)
- Felder im Canvas sortieren (DnD)
- Feld-Einstellungen inline bearbeiten (ohne Properties-Column)
- Kontaktfelder als deduplizierte Bausteine (per Key)
- Form Settings als eigenes Panel (Name, Status etc.)
- Entry-Flow so, dass “Open” direkt in den Builder führt

## Umsetzung / Resultat
### Navigation
- /admin/forms zeigt Form-Liste
- “Open” führt in den Builder (statt Detailseite)
- Builder Route: /admin/forms/[id]/builder
- Next.js dynamic params (Promise unwrap) wurde korrigiert, damit formId nicht “undefined” wird.

### Field Library (links)
- Tabs:
  - Form fields (Text, Textarea, Checkbox, Selects, …)
  - Contact fields (First name, Last name, Company, E-mail, Phone, …)
- Presets:
  - Rating (1–5) als SINGLE_SELECT-Preset (Phase-1 kompatibel, kein neuer FieldType nötig)
  - Yes/No
  - Consent (Checkbox inkl. Help-Text)
- Contact Block Quick-Add:
  - “Essentials” und “Full”
  - Hinweis/Transparenz, was Essentials enthält (User Guidance)
  - Dedupe: Kontaktfelder werden per key nicht doppelt angelegt

### Canvas (mitte)
- Drag’n’Drop Reorder der Felder
- Inline Field Settings direkt am Feld (Dropdown/Panel)
- Action Buttons am FieldCard (Settings / Duplicate / Delete) visuell verbessert (größer, cleaner)
- Delete bei Systemfeldern deaktiviert

### Form Settings Panel (rechts)
- Form-Basisdaten editieren (Name, Description)
- Status editieren (DRAFT / ACTIVE / ARCHIVED)
- Platzhalter für weitere Form-Settings (config)

## Technische Notizen
- Reorder API: /api/admin/v1/forms/[id]/fields/reorder (params unwrap fix)
- Persistierung Reihenfolge über ordered field ids
- Key-Kollisionen beim Create (409) werden per uniqKey + retry abgefangen

## Smoke / Abnahme
- npm run typecheck ✅
- npm run lint ✅
- npm run build ✅
- Manuell:
  - Feld aus Library klicken → erscheint im Canvas ✅
  - Feld aus Library ziehen → Canvas Insert ✅
  - Reorder im Canvas → persistiert ✅
  - Contact field dedupe (kein Duplicate) ✅
  - Rating Preset erzeugt SINGLE_SELECT mit 1..5 ✅
  - Form Settings (Name/Status) speichern ✅
  - FieldCard Action Buttons “nicer” ✅

## Git
HEAD: ea12b16 ui(tp4.7): nicer field card action buttons

## Offene Punkte / Phase 2+
- Echte Rating-UI (Stars) als neuer FieldType + mobile Rendering
- Upload Feld (Attachments) als eigener FieldType (Design + Mobile Flow)
- Design/Branding pro Form (Darkmode / Farben / Template Styles) ausbauen
- Template-System (Form als Vorlage speichern / katalogisieren)
