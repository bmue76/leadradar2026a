# LeadRadar2026A — API Contracts

## Namespaces
- `/api/platform/v1/*` — Platform/Health/Meta
- `/api/admin/v1/*` — Admin UI
- `/api/mobile/v1/*` — Mobile App

## Standard Responses
### Success
```json
{ "ok": true, "data": {}, "traceId": "..." }


eof

---

## Admin — Forms + Fields (TP 1.1)

Namespace: `/api/admin/v1/*`  
Tenant Context: `x-tenant-slug`

### Forms

#### GET `/api/admin/v1/forms`
Query:
- `status?`: `DRAFT|ACTIVE|ARCHIVED`
- `q?`: search in `name` (contains, case-insensitive)

Response:
- `forms[]` (ohne fields) + `fieldsCount` (optional nice-to-have)

#### POST `/api/admin/v1/forms`
Body:
```json
{ "name": "Messe Kontakt 2026", "description": "Demo", "status": "DRAFT", "config": {} }
