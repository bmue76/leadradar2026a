# Teilprojekt 1.4: Admin Screen — Form Detail (Fields CRUD + Reorder + Status Toggle) — Schlussrapport

Status: READY FOR TEST/COMMIT  
Datum: 2026-01-02  
Commit(s): _TBD_

## Ziel
Placeholder unter `/admin/forms/[id]` ersetzen durch einen kundentauglichen Detail-Screen inkl.:
- Form Header (Name/Description/Status/Meta)
- Status Toggle via PATCH `/api/admin/v1/forms/:id/status`
- Fields CRUD via POST/PATCH/DELETE
- Reorder (MVP ohne Drag&Drop) via Up/Down + Save → POST `/api/admin/v1/forms/:id/fields/reorder`
- Polished UX-States (Loading / Empty / Error inkl. traceId + Retry)

## Umsetzung (Highlights)
- Client lädt Form inkl. `fields[]` via `adminFetchJson` (tenant-scoped).
- Status Toggle: Optimistic UI + Rollback bei Fehler; Success Toast.
- Fields:
  - Tabelle mit Label/Key/Type/Flags
  - Create/Edit Modal mit UI-Validation (Key pattern + required fields)
  - KEY_CONFLICT (409) wird freundlich gemappt („Key already exists…“)
  - Delete mit Confirm
- Reorder:
  - Inline Up/Down Buttons
  - “Save order” nur bei Dirty-State
  - Nach Save: refetch/normalize + “Order saved.”

## Dateien / Änderungen
- `src/app/(admin)/admin/forms/[id]/page.tsx`
- `src/app/(admin)/admin/forms/[id]/FormDetailClient.tsx`
- `src/app/(admin)/admin/forms/[id]/FieldsTable.tsx`
- `src/app/(admin)/admin/forms/[id]/FieldModal.tsx`
- `src/app/(admin)/admin/forms/[id]/ReorderControls.tsx`
- `src/app/(admin)/admin/forms/[id]/formDetail.types.ts`
- `docs/LeadRadar2026A/04_ADMIN_UI.md`
- `docs/teilprojekt-1.4-admin-form-detail.md`

## Akzeptanzkriterien – Check
- [ ] Detailseite lädt ohne Errors
- [ ] Leak-safe 404 wird freundlich angezeigt (traceId + Retry)
- [ ] Status Toggle funktioniert
- [ ] Fields CRUD funktioniert (inkl. KEY_CONFLICT handling)
- [ ] Reorder speichert Reihenfolge reproduzierbar
- [ ] `npm run typecheck` grün
- [ ] `npm run lint` grün
- [ ] `npm run build` grün
- [ ] Doku + Schlussrapport committed, `git status` clean

## Tests / Proof (reproduzierbar)
```bash
cd /d/dev/leadradar2026a
npm run dev
# http://localhost:3000/admin/forms
# Open eine Form → /admin/forms/[id]
