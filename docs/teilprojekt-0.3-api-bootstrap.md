# Teilprojekt 0.3 — API Bootstrap (Tenant Context + Standard Responses) — Schlussrapport

Status: DONE  
Datum: 2025-12-31  
Commit(s):
- <COMMIT_HASH_1> feat(api): tenant context + standard responses + admin contracts
- <COMMIT_HASH_2> fix(api): prisma init (driver adapter safe) + force node runtime
- <COMMIT_HASH_3> docs: add teilprojekt 0.3 schlussrapport + api docs

## Ziel
API-Fundament erstellen, damit alle folgenden Screens/Features **tenant-sicher, leak-safe und konsistent** aufsetzen können:

- Tenant Resolve via `x-tenant-slug` (Admin & Mobile Standard)
- `requireTenantContext(req)` inkl. sauberem Error-Flow
- Standard Responses überall: `jsonOk/jsonError` + `traceId` im Body + `x-trace-id` Header
- Zod Validation strikt via zentrale Helpers (`validateBody`, `validateQuery`)
- Contract-Proof Endpoint:
  - `GET /api/admin/v1/tenants/current`
- Optional (DEV-only): `GET /api/admin/v1/users/me` via `x-user-email`

## Umsetzung (Highlights)
- Tenant Utilities (`src/lib/tenant.ts`) als **Single Source of Truth**:
  - `getTenantSlug(req)`
  - `resolveTenantBySlug(slug)` (Prisma lookup)
  - `requireTenantContext(req)` wirft definierte `HttpError`s
- Response Standardisierung (`src/lib/api.ts`):
  - `getTraceId` Header-Priorität
  - `jsonOk/jsonError` setzen immer `x-trace-id`
- Validation Foundation (`src/lib/http.ts`):
  - zentraler `HttpError` Flow
  - `validateQuery` arbeitet sauber mit `URLSearchParams`
- Admin Contract Endpoint:
  - Tenant Context Proof (`/tenants/current`)
- Stabilisierung Prisma in Next Route Handlers:
  - Initialer 500 HTML Fehler durch `PrismaClientInitializationError` (Driver Adapter Setup erwartete Options)
  - Fix: `src/lib/prisma.ts` adapter-aware (pg/@prisma/adapter-pg) + Routes auf `runtime = "nodejs"`

## Dateien/Änderungen
- `src/lib/api.ts`
- `src/lib/http.ts`
- `src/lib/prisma.ts`
- `src/lib/tenant.ts`
- `src/app/api/admin/v1/tenants/current/route.ts`
- `src/app/api/admin/v1/users/me/route.ts` (optional)
- `docs/LeadRadar2026A/03_API.md`
- `docs/teilprojekt-0.3-api-bootstrap.md`

## Akzeptanzkriterien — Check
- [x] Ohne `x-tenant-slug` → **401 TENANT_REQUIRED**
- [x] Unbekannter Slug → **404 NOT_FOUND (leak-safe)**
- [x] Responses: `jsonOk/jsonError` + `traceId` im Body + `x-trace-id` Header
- [x] Validation/Parsing nur über zentrale Helpers (kein ad-hoc JSON Handling in Routes)
- [ ] DoD: typecheck/lint/build + commits gepusht + git status clean (siehe unten)

## Tests / Proof (reproduzierbar)

### Runtime
```bash
npm run dev
# http://localhost:3000

