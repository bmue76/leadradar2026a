# Teilprojekt 1.1 — Admin API Contracts — Forms/Fields (CRUD + Sort + Status) — Schlussrapport

Status: DONE  
Datum: 2025-12-31  
Commit(s): (nach Commit eintragen)

## Ziel
Admin API Contracts für **Forms + Fields** liefern (tenant-sicher & konsistent), als Grundlage für die nächsten Admin Screens (Forms List, Form Detail, später Formbuilder).

**Forms**
- List (status?, q?)
- Create
- Get by id (inkl. fields[] sortiert)
- Update (name/description/config)
- Status setzen (separater Endpoint)

**Fields**
- Create / Update / Delete (hard)
- Reorder via sortOrder (Batch, leak-safe)

## Umsetzung (Highlights)
- **Tenant Context** via `x-tenant-slug` → `requireTenantContext(req)` (fehlend: 401 TENANT_REQUIRED; unbekannter slug: 404 NOT_FOUND leak-safe)
- **Leak-safe** Zugriff: Form/Field Lookups immer `tenantId` scoped → mismatch/unknown → 404 NOT_FOUND
- **Standard Responses**: `jsonOk/jsonError` inkl. `traceId` im Body + `x-trace-id` Header
- **Validation only**: Zod + `validateBody/validateQuery`
- **Runtime**: Prisma-Routen laufen auf Node (`export const runtime = "nodejs"`)
- Fixes für reale Runtime-Themen:
  - Next.js Dynamic APIs: `ctx.params` kann Promise sein → `getParams()` unwrap
  - Prisma v7 JSON-null: `config=null` via `Prisma.DbNull` (statt plain `null`)
  - ID-Validation: nicht zu strikt (cuid2-like IDs), um false-404 zu vermeiden

## Endpoints (implementiert)
**Forms**
- `GET  /api/admin/v1/forms`
- `POST /api/admin/v1/forms`
- `GET  /api/admin/v1/forms/:id` (inkl. `fields[]` sortiert nach `sortOrder asc, createdAt asc`)
- `PATCH /api/admin/v1/forms/:id` (name/description/config)
- `PATCH /api/admin/v1/forms/:id/status` (status: DRAFT|ACTIVE|ARCHIVED)

**Fields**
- `POST   /api/admin/v1/forms/:id/fields`
- `PATCH  /api/admin/v1/forms/:id/fields/:fieldId`
- `DELETE /api/admin/v1/forms/:id/fields/:fieldId`
- `POST   /api/admin/v1/forms/:id/fields/reorder` (body: `{ order: string[] }`)

## Dateien / Änderungen
- `src/lib/auth.ts`
- `src/app/api/admin/v1/forms/route.ts`
- `src/app/api/admin/v1/forms/[id]/route.ts`
- `src/app/api/admin/v1/forms/[id]/status/route.ts`
- `src/app/api/admin/v1/forms/[id]/fields/route.ts`
- `src/app/api/admin/v1/forms/[id]/fields/[fieldId]/route.ts`
- `src/app/api/admin/v1/forms/[id]/fields/reorder/route.ts`
- `docs/LeadRadar2026A/03_API.md`
- `docs/teilprojekt-1.1-admin-api-forms-fields.md`

## Akzeptanzkriterien – Check
- [x] Tenant Context erforderlich (`x-tenant-slug`) → 401 TENANT_REQUIRED
- [x] Unbekannter Tenant → 404 NOT_FOUND (leak-safe)
- [x] Form/Field anderer Tenant → 404 NOT_FOUND (leak-safe)
- [x] Zod Validation aktiv (Body/Query)
- [x] Unique Konflikt Field.key → 409 KEY_CONFLICT (Prisma P2002 gemappt)
- [x] Reorder leak-safe bei mismatch → 404 NOT_FOUND
- [x] Node runtime gesetzt
- [x] Doku aktualisiert (03_API.md)
- [x] Quality Gates: typecheck/lint/build grün
- [x] Commits gepusht, git status clean

## Tests / Proof (reproduzierbar)
A) List Forms (200) – Beispiel Trace

x-trace-id: 314ac0f1-28e1-49d5-a91d-7550a344293f

curl -s -i -H "x-tenant-slug: atlex" \
  "http://localhost:3000/api/admin/v1/forms"


B) Create Form (201) – Beispiel Trace

x-trace-id: fa2347ee-a793-45d1-ac7e-76ccf3c1a6dd

curl -s -i -H "x-tenant-slug: atlex" -H "content-type: application/json" \
  -d '{"name":"Messe Kontakt 2026","description":"Demo Form"}' \
  "http://localhost:3000/api/admin/v1/forms"


C) Get Form by id (200 inkl. fields[]) – Beispiel Trace

x-trace-id: 6d553426-c32b-41c5-b09c-b71d5d666863

D) Status setzen (PATCH, 200) – Beispiel Trace

x-trace-id: e00efa9d-4e9c-45bb-8168-1ffbc5f5ae0e

E) Fields Create/Update/Reorder/Delete + 409 Conflict

# FORM_ID aus Create-Response verwenden
FORM_ID="<FORM_ID>"

# create field
curl -s -i -H "x-tenant-slug: atlex" -H "content-type: application/json" \
  -d '{"key":"interest","label":"Interesse","type":"SINGLE_SELECT","required":false,"config":{"options":["A","B","C"]}}' \
  "http://localhost:3000/api/admin/v1/forms/$FORM_ID/fields"

# duplicate key -> 409 KEY_CONFLICT
curl -s -i -H "x-tenant-slug: atlex" -H "content-type: application/json" \
  -d '{"key":"interest","label":"Duplicate","type":"TEXT"}' \
  "http://localhost:3000/api/admin/v1/forms/$FORM_ID/fields"


H) Leak-safe (404)

curl -s -i -H "x-tenant-slug: does-not-exist" \
  "http://localhost:3000/api/admin/v1/forms/<ANY_ID>"


Quality Gates:

npm run typecheck
npm run lint
npm run build

Mini-Note für deinen Schlussrapport (falls du ihn noch ergänzen willst)

feat(api) Commit: 3aae6c3

Wichtigste Fixes: ctx.params Promise unwrap + Prisma v7 JSON-null via Prisma.DbNull + cuid2-ish ID validation

Proof TraceIds hast du schon (GET by id + PATCH status).
