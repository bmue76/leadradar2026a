# Schlussrapport — Teilprojekt 5.3: Setup → Vorlagen UI (Grid + Preview Drawer) + “Formular aus Vorlage erstellen” Flow (ONLINE-only, MVP)

Datum: 2026-01-30  
Status: DONE ✅  
Git: (bitte nach Commit ergänzen)

## Ziel

Setup → Vorlagen produktiv nutzbar machen:

- `/admin/templates` zeigt Vorlagen als Grid Cards (Apple-clean) inkl. Search/Filter/Sort.
- Preview Drawer (read-only Felderliste) pro Vorlage.
- “Verwenden” erstellt neues Formular als **DRAFT**, **ohne Assignment** (assignedEventId = null).
- Nach Create: Redirect nach `/admin/forms` (mit Auto-Open via `?open=FORM_ID`).
- CTA “Neues Formular” in `/admin/forms` führt in den Templates-Flow (`/admin/templates?intent=create`).

## Umsetzung (Highlights)

- **Tenant-scope & leak-safe 404** konsequent für Template-Detail & Create-Flow.
- **API Contracts**: List, Detail, Create-from-template (jsonOk/jsonError + traceId + x-trace-id).
- **UI**:
  - Templates Grid inkl. Filter/Sort/Search.
  - Preview Drawer zeigt Felder (Required Marker).
  - “Verwenden” öffnet Modal (Name vorbefüllt) und erstellt DRAFT-Form.
  - Redirect nach `/admin/forms?open=...` öffnet Drawer automatisch.
- **Next.js Build-Fix**:
  - `useSearchParams()` in Client-Komponenten via **Suspense Boundary** im `page.tsx`.
  - Page-Header/Title wieder konsistent zu `/admin` (Apple-clean Pattern).

## Dateien / Änderungen (Auszug)

- `src/app/api/admin/v1/templates/route.ts` — List Templates (Query Zod)
- `src/app/api/admin/v1/templates/[id]/route.ts` — Template Detail (tenant-scoped)
- `src/app/api/admin/v1/templates/[id]/create-form/route.ts` — Create Form from Template (DRAFT, no assignment)
- `src/app/api/admin/v1/templates/_repo.ts` — Repo/DB Zugriff (normalize fields/payload)
- `src/app/(admin)/admin/templates/page.tsx` — Header + Suspense
- `src/app/(admin)/admin/templates/TemplatesScreenClient.tsx` — Grid + Drawer + Create Flow
- `src/app/(admin)/admin/forms/page.tsx` — Header + Suspense
- `src/app/(admin)/admin/forms/FormsScreenClient.tsx` — CTA to templates + Auto-Open drawer via query
- `docs/LeadRadar2026A/00_INDEX.md` — Teilprojekt 5.3 ergänzt

## Akzeptanzkriterien — Check ✅

- [x] Templates Grid lädt, Filter/Sort/Search funktioniert.
- [x] Preview Drawer zeigt Felder read-only.
- [x] “Verwenden” → Modal → neues Formular erstellt (DRAFT, assignedEventId=null).
- [x] Redirect nach `/admin/forms` + Drawer Auto-Open.
- [x] `/admin/forms` CTA führt zu `/admin/templates?intent=create`.
- [x] Tenant-scope leak-safe (falsche IDs/Tenant → 404).
- [x] API Standard jsonOk/jsonError + traceId + x-trace-id.
- [x] Zod Validation via validateQuery/validateBody.
- [x] Phase 1 ONLINE-only: keine Offline-Themen implementiert.

## Tests / Proof (reproduzierbar)

### Quality Gates
```bash
npm run typecheck
npm run lint
npm run build
API Proof
bash
Code kopieren
curl -i -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/templates?source=ALL"

curl -i -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/templates/TEMPLATE_ID"

curl -i -X POST -H "cookie: lr_session=DEIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"name":"Besucher Lead (Swissbau)"}' \
  "http://localhost:3000/api/admin/v1/templates/TEMPLATE_ID/create-form"
Erwartung:

Form existiert als DRAFT

assignedEventId = null

Felder/Schema aus Template kopiert

UI Smoke
/admin/templates öffnen → Grid lädt

Vorschau öffnen → Felder sichtbar

Verwenden → Modal → Erstellen → Redirect /admin/forms

Neues Formular sichtbar, Drawer/Builder erreichbar

Offene Punkte / Risiken
P1: SYSTEM Templates (global) vs TENANT Templates: MVP nutzt vorhandenes Model FormTemplate mit tenantId (nur Tenant-Templates). SYSTEM Seeds können später ergänzt werden (Schema/Nullable tenantId oder separates Seed-Konzept).

P1: Template-Kategorien & mehr Content (3–5 “Standard”-Vorlagen) kann iterativ erweitert werden.

Next Step
TP 5.4: Setup → Geräte/Provisioning UI (wenn geplant) oder Betrieb → Leads/Exports weiter polieren (GoLive Flow).
