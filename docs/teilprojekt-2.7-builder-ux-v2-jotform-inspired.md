# Schlussrapport — Teilprojekt 2.7: Builder UX v2 (Jotform-inspired)

Datum: 2026-01-07  
Status: READY ✅ (typecheck+lint grün, UI Smoke ok)  
Commit(s): (nach Commit eintragen)

## Ziel

Den Formular-Builder im Admin klar “Form-Builder-like” machen (Jotform-inspiriert), ohne den MVP zu überfrachten:

- Canvas-first: Felder werden primär im Canvas (Cards/Blocks) gebaut
- 3-Step Flow: Build / Design / Publish
- Quick Actions am Field (Duplicate/Delete/Required/Active + Drag Handle)
- Properties Panel rechts, typsicher & FieldType-relevant
- Ruhige, geführte UI + Microcopy (“All changes saved / Saving / Error”)

## Umsetzung (Highlights)

- Builder UX v2 umgesetzt: Canvas-first mit Field Cards, DnD-Reorder direkt im Canvas.
- “Build / Design / Publish” Steps integriert; Design als “Coming soon” (Phase 1), Publish als Status-Step.
- Quick Actions direkt am Field (Duplicate/Delete/Required/Active) inkl. Hover-reveal (Jotform-like).
- Add Field als primäre Aktion: am Ende + zwischen Cards (Hover).
- Properties Panel zeigt nur relevante Inputs (Select/Checkbox Optionen konditional).
- Typsicherheit: FieldType/Builder Types zentral (builderV2.types), keine any.

## UX/Architektur-Entscheide

### Autosave
Option 1: Autosave (debounced) für Field-Edits, Statusanzeige über Save-State im UI.

### Component Tree (wichtigste Teile)
- `src/app/(admin)/admin/forms/[id]/FormDetailClient.tsx` (Entry / Tab Switch)
- `src/app/(admin)/admin/forms/[id]/_components/FormWorkspace.tsx` (Adapter → BuilderV2)
- `src/app/(admin)/admin/forms/[id]/_components/builderV2/*`
  - `BuilderV2.tsx` (Step orchestration + Layout)
  - `build/BuildStep.tsx` (Build step header + Canvas)
  - `build/FieldCanvas.tsx` (Cards + DnD + Insert affordances)
  - `build/AddFieldModal.tsx` (FieldType Auswahl)
- `src/app/(admin)/admin/forms/[id]/_lib/builderV2.types.ts` (FieldType + UI Types)

## Dateien/Änderungen (Auszug)

- `src/app/(admin)/admin/forms/[id]/FormDetailClient.tsx`
- `src/app/(admin)/admin/forms/[id]/_components/FormWorkspace.tsx`
- `src/app/(admin)/admin/forms/[id]/_components/builderV2/BuilderV2.tsx`
- `src/app/(admin)/admin/forms/[id]/_components/builderV2/build/BuildStep.tsx`
- `src/app/(admin)/admin/forms/[id]/_components/builderV2/build/FieldCanvas.tsx`
- `src/app/(admin)/admin/forms/[id]/_components/builderV2/build/AddFieldModal.tsx`
- `src/app/(admin)/admin/forms/[id]/_lib/builderV2.types.ts`

## Akzeptanzkriterien – Check

- [x] `/admin/forms/[id]` lädt stabil, Builder ohne Console Errors
- [x] Canvas-first: Felder als Cards sichtbar, selektierbar, Properties rechts
- [x] Reorder per Drag&Drop im Canvas funktioniert
- [x] Duplicate/Delete funktionieren mit UI Feedback (Hook/Toast)
- [x] Properties Panel konsistent & typsicher
- [x] `npm run typecheck` grün
- [x] `npm run lint` grün

## Tests/Proof (reproduzierbar)

```bash
npm run typecheck
npm run lint
npm run dev
# UI Smoke:
# /admin/forms/[id] -> Builder -> Build
# - Add field
# - Select field -> edit properties
# - Drag&drop reorder
# - Duplicate + Delete
# - Toggle required / active

