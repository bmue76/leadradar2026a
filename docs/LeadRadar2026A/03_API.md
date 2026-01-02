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


---

## Admin — Leads (TP 1.6)

### GET /api/admin/v1/leads

Listet Leads tenant-scoped, cursor-basiert (stabil), Default Sorting: `capturedAt desc`, dann `id desc`.

**Query (MVP):**
- `formId` (optional, string) – wird leak-safe validiert (falscher Tenant → 404)
- `includeDeleted` (optional, boolean as string `"true"|"false"`, default `false`)
- `from` (optional, ISO datetime) – filter `capturedAt >= from`
- `to` (optional, ISO datetime) – filter `capturedAt <= to`
- `limit` (optional, int as string, default `50`, max `200`)
- `cursor` (optional, string) – opaque cursor (base64url von `capturedAt|id`)

**Response 200**
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "…",
        "formId": "…",
        "capturedAt": "…",
        "isDeleted": false,
        "values": {},
        "createdAt": "…",
        "updatedAt": "…"
      }
    ],
    "nextCursor": "…" 
  },
  "traceId": "…"
}

> Hinweis (MVP): Das Datenmodell `Lead` hat aktuell keine `createdAt/updatedAt`.  
> Für Admin-Responses werden `createdAt` und `updatedAt` **abgeleitet** (= `capturedAt`), damit UI/Exports stabil bleiben.
