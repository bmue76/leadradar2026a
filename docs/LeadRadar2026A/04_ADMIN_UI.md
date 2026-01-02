# LeadRadar2026A — Admin UI (Screens)

Stand: 2026-01-02  
Scope: Admin Web (Next.js App Router) — screen-by-screen, tenant-scoped, traceId überall.

## Leitplanken (für alle Screens)
- UI konsumiert **nur** Admin APIs via `adminFetchJson` (setzt `x-tenant-slug`).
- Standard Responses: `{ ok:true, data, traceId }` / `{ ok:false, error, traceId }` + `x-trace-id`.
- Leak-safe: falscher Tenant/ID → **404 NOT_FOUND** (freundlich anzeigen, inkl. traceId).
- UX-States pro Screen: Loading Skeleton, Empty State, Error State (Retry + traceId).

---

## TP 1.2 — Admin Shell + Navigation + WhoAmI/Tenant Badge
Route: `/admin`

---

## TP 1.3 — Forms List
Route: `/admin/forms`  
Features:
- GET `/api/admin/v1/forms` (Search `q`, Status Filter)
- Create Form via POST `/api/admin/v1/forms`
- Polished Table + Empty/Loading/Error States
- Row Action: Open → `/admin/forms/[id]`

---

## TP 1.4 — Form Detail (Fields CRUD + Reorder + Status Toggle)
Route: `/admin/forms/[id]`

### Form Header
- GET `/api/admin/v1/forms/:id` → Form inkl. `fields[]`
- Anzeige: Name, Description, Meta (createdAt/updatedAt)
- Status Toggle: PATCH `/api/admin/v1/forms/:id/status` (DRAFT/ACTIVE/ARCHIVED)
  - Optimistic UI + Rollback bei Fehler
  - Fehler: freundlich + traceId

### Fields Management
- Liste sortiert nach `sortOrder`
- Create: POST `/api/admin/v1/forms/:id/fields`
- Edit: PATCH `/api/admin/v1/forms/:id/fields/:fieldId`
- Delete: DELETE `/api/admin/v1/forms/:id/fields/:fieldId` (Confirm)
- Reorder (MVP):
  - Up/Down Buttons
  - “Save order” bei Änderung
  - Save: POST `/api/admin/v1/forms/:id/fields/reorder` `{ order: fieldIds[] }`
  - Feedback: “Order saved.”

### UX-States
- Loading Skeleton
- Empty Fields CTA “Add your first field”
- Error State: Nachricht + traceId + Retry (inkl. leak-safe 404)

## /admin/leads — Leads List (TP 1.7)
**Scope:** Liste + Filter + Cursor Paging + Detail Drawer (ohne neue Page)  
**APIs:**  
- GET /api/admin/v1/leads (cursor paging + filter: formId/includeDeleted/from/to/limit)  
- GET /api/admin/v1/leads/:id  
- DELETE /api/admin/v1/leads/:id (soft-delete)  
- POST /api/admin/v1/leads/:id/restore (optional)  
- GET /api/admin/v1/forms (Form Filter)

**UX:** Loading Skeleton, Empty State, Error State mit traceId + Retry.  
**Detail Drawer:** Values (key/value), Attachments Liste (Download disabled “coming later”).
