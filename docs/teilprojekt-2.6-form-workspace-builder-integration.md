# Schlussrapport — Teilprojekt 2.6: Form Workspace (Builder-Integration via Tabs + Drag&Drop Reorder)

Datum: 2026-01-07  
Status: DONE ✅

## Ziel
Den bisherigen Flow optimieren:
- /admin/forms: tabellarische Übersicht
- /admin/forms/[id]: Form-Detail (Status, Meta, Fields)
- Builder-Funktionalität (Preview + Properties) nicht als separater “Kontextwechsel”, sondern direkt in /admin/forms/[id] integrieren.

## Ergebnis (Was ist jetzt besser)
- /admin/forms/[id] enthält einen **Workspace (Tabs)**:
  - **Overview**: Form-Metadaten + Status
  - **Builder**: 3-Pane Workspace
    - Links: Fields-Liste (Type/Required/Active) + Add Field + Reorder
    - Mitte: Preview (rendert aktive Felder)
    - Rechts: Properties (Edit selected field inkl. Select Options / Checkbox Default)
- Reorder erfolgt per **Drag&Drop** (mit Drag-Handle/“Händchen”), Speicherung weiterhin bewusst via **Save order**.
- /admin/forms/[id]/builder bleibt als Route bestehen (Alias/Tab-Start), verhindert Kontextverlust für Nutzer, die den alten Link nutzen.

## Umsetzung (Highlights)
- Neuer Hook `useFormDetail()` als zentrale Logik:
  - Laden/Refresh FormDetail (tenant-scoped via Admin API)
  - Selection/Draft-Ableitung aus Field config
  - Reorder-Local State + Persist via `POST /api/admin/v1/forms/:id/fields/reorder`
  - Save Field via `PATCH /api/admin/v1/forms/:id/fields/:fieldId`
  - Create Field via `POST /api/admin/v1/forms/:id/fields`
- UI-Aufteilung als Workspace-Komponenten (3-Pane).
- Next.js 16 Dynamic Params: Page-Params korrekt async/await behandelt, damit kein “params is a Promise” Runtime-Error mehr auftritt.

## Betroffene Dateien (Kern)
- `src/app/(admin)/admin/forms/[id]/FormDetailClient.tsx`
- `src/app/(admin)/admin/forms/[id]/_components/FormWorkspace.tsx`
- `src/app/(admin)/admin/forms/[id]/_components/workspace/FieldsList.tsx`
- `src/app/(admin)/admin/forms/[id]/_lib/useFormDetail.ts`
- `package.json`, `package-lock.json` (Drag&Drop dependency)
- optional: `next-env.d.ts` (nur wenn inhaltlich geändert)

## API / Contracts
Keine neuen Endpoints; bestehende Admin API genutzt:
- `GET /api/admin/v1/forms/:id`
- `PATCH /api/admin/v1/forms/:id/status`
- `POST /api/admin/v1/forms/:id/fields`
- `PATCH /api/admin/v1/forms/:id/fields/:fieldId`
- `POST /api/admin/v1/forms/:id/fields/reorder`

## Manuelle Tests
- /admin/forms → Klick auf Formular → /admin/forms/:id lädt korrekt
- Tab “Builder”:
  - Field auswählen → Properties rechts befüllt
  - Änderungen speichern → Preview aktualisiert
  - Reorder via Drag&Drop → Save order → Reihenfolge bleibt nach Reload erhalten
  - Add Field → erscheint und ist selektierbar
- Lint/Typecheck grün

## Known Limitations (bewusst)
- Reorder aktuell nur in Fields-Liste (nicht direkt im Preview-Canvas).
- Kein “Duplicate Field”, keine Undo-Toast (kommt in nächstem TP).
- UX ist funktional, aber noch nicht “kundenfreundlich/Jotform-like” – folgt als TP 2.7.

## Next Step
Teilprojekt 2.7: **Builder UX v2 (Jotform-inspired)**
- Build / Design / Publish Flow
- Canvas-first Cards + Reorder im Canvas
- Quick actions (Duplicate/Delete), Undo, bessere Microcopy, “All changes saved”.
