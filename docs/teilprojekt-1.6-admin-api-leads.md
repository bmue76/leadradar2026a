# Teilprojekt 1.6: Admin API Contracts — Leads (List/Detail/Soft-Delete + Attachments) — Schlussrapport

Status: DONE  
Datum: 2026-01-02  
Commit(s):
- <TBD> feat(api): admin leads contracts (list/detail/soft-delete)
- <TBD> docs: add teilprojekt 1.6 schlussrapport

## Ziel
Admin API Contracts für Leads implementieren als Grundlage für:
- nächsten Admin Screen **/admin/leads** (TP 1.7)
- spätere Exports (TP 1.8)

Scope:
- Leads List (cursor paging + filter)
- Lead Detail (inkl. attachments)
- Soft-Delete (idempotent)
- Optional Restore

## Umsetzung (Highlights)
- Strikt tenant-scoped über `requireTenantContext(req)` (Header `x-tenant-slug`)
- Leak-safety: fremde IDs/Tenant-Mismatch → **404 NOT_FOUND**
- Standard Responses: `jsonOk/jsonError` mit `traceId` im Body + `x-trace-id` Header
- Zod Validation ausschließlich über `validateQuery/validateBody`
- Cursor Pagination stabil via `(capturedAt,id)` (opaque base64url cursor)
- MVP-Kompatibilität: `Lead` hat aktuell keine `createdAt/updatedAt` → in Responses **derived** (= `capturedAt`)

## Dateien/Änderungen
- `src/app/api/admin/v1/leads/route.ts` (GET list)
- `src/app/api/admin/v1/leads/[id]/route.ts` (GET detail + DELETE soft-delete)
- `src/app/api/admin/v1/leads/[id]/restore/route.ts` (POST restore, optional)
- `prisma/seed.ts` (DEV seed: Tenant atlex upsert via prisma-wrapper)
- `docs/LeadRadar2026A/03_API.md` (Contracts ergänzt)
- `docs/teilprojekt-1.6-admin-api-leads.md` (dieser Rapport)

## Akzeptanzkriterien – Check
- [x] Leads List: pagination + filter (formId/includeDeleted/from/to/limit/cursor)
- [x] Lead Detail inkl. attachments
- [x] Soft-Delete setzt `isDeleted/deletedAt/deletedReason` und ist idempotent
- [x] Tenant-scope & leak-safe 404 überall
- [x] Standard Responses + traceId + x-trace-id überall
- [x] Zod Validation via validateQuery/validateBody
- [x] Runtime: nodejs in Prisma-Routen
- [x] DEV seed lauffähig trotz Prisma client engine/adapter constraints

## Tests/Proof (reproduzierbar)
Voraussetzung: `npm run dev`

A) 401 ohne Tenant
```bash
curl -i http://localhost:3000/api/admin/v1/leads
