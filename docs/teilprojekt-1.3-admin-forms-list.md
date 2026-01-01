# Teilprojekt 1.3 — Admin Screen: Forms List (UI + Wiring an Admin Contracts) — Schlussrapport

Status: DONE  
Datum: 2026-01-02  
Commit(s):
- c23d167 feat(admin): forms list screen (search/filter/create)

---

## Ziel
Kundentaugliche Forms-Übersicht unter `/admin/forms`:

- Liste aller Forms (GET `/api/admin/v1/forms`)
- Search (`q`) + Status Filter (DRAFT/ACTIVE/ARCHIVED)
- Create Form (POST `/api/admin/v1/forms`) via Modal
- Empty/Loading/Error States inkl. traceId + Retry
- Row Action “Open” → `/admin/forms/[id]` (Placeholder bis TP 1.4)

---

## Umsetzung (Highlights)
- UI verdrahtet ausschliesslich über `adminFetchJson` (Tenant Header `x-tenant-slug`) – keine API-Bypässe.
- Debounced Search (~320ms) + Status Select.
- Polished Table: Name + Status Badge + UpdatedAt + “Open”.
- Create Modal:
  - Name required (min 1 char), Description optional, Status default DRAFT
  - Submit disabled während Request
  - Freundliche Fehleranzeige + traceId
  - Nach Erfolg: Modal schliesst, Liste refresht, Inline “Form created.”
- Placeholder Detail Page `/admin/forms/[id]` (Next 15/16 params async korrekt behandelt).

Dev-Hinweis:
- Nach `npx prisma generate` ist ein Dev-Server Restart sinnvoll (Next/Turbopack Cache).

---

## Dateien / Änderungen
UI:
- `src/app/(admin)/admin/forms/page.tsx`
- `src/app/(admin)/admin/forms/FormsListClient.tsx`
- `src/app/(admin)/admin/forms/CreateFormModal.tsx`
- `src/app/(admin)/admin/forms/forms.types.ts`
- `src/app/(admin)/admin/forms/[id]/page.tsx` (Placeholder)

DX:
- `prisma.config.ts` (Env loading + valid URL pick + shadow schema URL)

Docs:
- `docs/LeadRadar2026A/04_ADMIN_UI.md`
- `docs/teilprojekt-1.3-admin-forms-list.md`

---

## Akzeptanzkriterien — Check
- [x] /admin/forms lädt ohne Errors
- [x] List zeigt Forms korrekt (Name + Status)
- [x] Search & Status Filter funktionieren reproduzierbar
- [x] Create Form erstellt Form und Liste aktualisiert
- [x] Empty State mit CTA vorhanden
- [x] Error State zeigt traceId + Retry
- [x] npm run typecheck grün
- [x] npm run lint grün
- [x] npm run build grün
- [ ] Docs + Rapport committed; git status clean (nach Docs-Commit)

---

## Tests / Proof (reproduzierbar)

### UI Proof
```bash
cd /d/dev/leadradar2026a
npm run dev
# http://localhost:3000/admin/forms
```

Erwartung:
- Liste lädt (z. B. “Kontakt” sichtbar)
- Search reduziert Liste (debounced)
- Status Filter funktioniert
- Create Form erzeugt Form und Liste aktualisiert
- “Open” führt auf Placeholder `/admin/forms/[id]`

### API Sanity
```bash
curl -i -H "x-tenant-slug: atlex" "http://localhost:3000/api/admin/v1/tenants/current"
curl -i -H "x-tenant-slug: atlex" "http://localhost:3000/api/admin/v1/forms"
```

### Error traceId Beispiel (falscher Tenant)
- a9567f54-3d38-41bf-806d-0e7cb4778b97

```bash
curl -i -H "x-tenant-slug: wrong-tenant" "http://localhost:3000/api/admin/v1/forms"
```

### Quality Gates
```bash
npm run typecheck
npm run lint
npm run build
```

---

## Offene Punkte / Risiken
- P1: `prisma migrate diff` benötigt Shadow-DB/Schema; bei shadow-schema Setup ist die Ausgabe nicht als Drift-Check zu interpretieren (optional).
- P1: TP 1.4 ersetzt Placeholder durch echten Detail-Screen (Fields CRUD + Reorder).

---

## Next Step
Teilprojekt 1.4 — Admin Screen: Form Detail (Fields CRUD + Reorder)
