# Teilprojekt 1.6: Admin API Contracts — Leads (List/Detail/Soft-Delete + Attachments) — Schlussrapport

Status: DONE  
Datum: 2026-01-02  
Commit(s):
- fbf40e1 feat(api): admin leads contracts (list/detail/soft-delete)
- f2cd23a docs: add teilprojekt 1.6 schlussrapport
- (addendum) docs: tp 1.6 turbulences + data model learnings (dieser Nachtrag)

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
- MVP-Kompatibilität: `Lead` hat aktuell **keine** `createdAt/updatedAt` → in Responses **derived** (= `capturedAt`)

## Turbulenzen & Datenmodell-Learnings (wichtig für Folge-TPs)
Diese Punkte haben zu 500/404-Turbulenzen geführt und sind nun mitigiert:

1) **DB Drift nach Reset**
- `npx prisma migrate dev` meldete **Drift detected** → DEV-DB musste via `npx prisma migrate reset --force` neu aufgebaut werden.
- Konsequenz: DEV-Umgebungen dürfen nicht “nebenbei” via `db push`/manuelle DB-Änderungen abweichen. Migrations sind Source of Truth.

2) **Seed fehlte nach Reset**
- Nach Reset existierte `tenantSlug=atlex` nicht → Admin Requests lieferten leak-safe **404** (korrektes Verhalten, aber verwirrend im Dev).
- Fix/Standard: Nach jedem Reset muss ein Seed laufen (siehe Runbook/DB-Note unten).

3) **Prisma Client Engine "client": Scripts dürfen NICHT `new PrismaClient()` nutzen**
- Im Repo ist Prisma so konfiguriert, dass `new PrismaClient()` ohne `adapter`/`accelerateUrl` scheitert:
  *Using engine type "client" requires either "adapter" or "accelerateUrl".*
- Dadurch waren Node-One-Liner/Seeds kaputt.
- Fix: `prisma/seed.ts` nutzt den bestehenden Prisma-Wrapper `src/lib/prisma` (Adapter/Config korrekt).

4) **Lead Model hat kein createdAt/updatedAt**
- Prisma Validation Error im List-Endpoint: *Unknown argument `createdAt`.*
- Fix:
  - Cursor & Sort stabil auf **(capturedAt, id)**.
  - API liefert `createdAt/updatedAt` als **derived** (= `capturedAt`) für Contract-Kompatibilität (MVP), bis wir echte Timestamps als DB-Feature nachziehen.

## Datenmodell-Notizen (Lead) — MVP-Stand
- Primäres Zeitfeld für List/Sort/Cursor: **`capturedAt`**
- Soft-Delete Felder: **`isDeleted`, `deletedAt`, `deletedReason`**
- Payload: **`values`** (JSON)
- Beziehungen: `tenantId`, `formId`, `attachments`

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
EOF 
