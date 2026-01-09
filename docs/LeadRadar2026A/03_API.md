# LeadRadar2026A – API (Admin/Mobile/Platform)

Stand: 2026-01-09  
Prinzipien: tenant-scoped, leak-safe (falscher Tenant/ID => 404), Standard Responses + traceId.

---

## Base Paths

- Admin API: `/api/admin/v1/*`
- Mobile API: `/api/mobile/v1/*`
- Platform: `/api/platform/v1/*`

Versionierung ist Bestandteil des Pfads (`v1`).

---

## Standard Responses

### Success
- Header: `x-trace-id: <uuid>`
- Body:
```json
{ "ok": true, "data": { "...": "..." }, "traceId": "..." }
Error
Header: x-trace-id: <uuid>

Body:

json
Code kopieren
{
  "ok": false,
  "error": { "code": "SOME_CODE", "message": "Human readable", "details": {} },
  "traceId": "..."
}
Common Headers
content-type: application/json; charset=utf-8

x-trace-id (Response Header; identisch zum traceId im Body)

Error Codes (Guideline)
INVALID_BODY / INVALID_QUERY (400) – Zod Validation

UNAUTHORIZED (401) – fehlender/ungültiger Login (Admin) oder ApiKey (Mobile)

NOT_FOUND (404) – leak-safe bei falschem Tenant/ID oder unassigned Form

RATE_LIMITED (429) – best-effort Rate Limiting (Phase 1)

INTERNAL / INTERNAL_ERROR (500)

Hinweis: Codes sind endpoint-spezifisch, aber Stabilität + keine Leaks sind Pflicht.

Auth
Admin Auth (Session)
Admin Endpoints sind session-protected (Login/Logout via /api/auth/*).
Tenant Context ist serverseitig enforced (tenant-scoped Zugriff). Bei falschem Tenant/ID => 404.

Mobile Auth (ApiKey) — TP 2.5
Alle /api/mobile/v1/* Endpoints erfordern einen gültigen ApiKey:

Header: x-api-key: <token>

ApiKey gehört zu genau einem Tenant

Speicherung in DB: nur Hash (HMAC-SHA256) + prefix, niemals Klartext

Klartext Key wird nur einmalig bei Erstellung angezeigt (Admin Create)

Fehlerverhalten:

missing/invalid/revoked key => 401 UNAUTHORIZED

form not assigned => 404 NOT_FOUND (leak-safe)

rate limited => 429 RATE_LIMITED

Mobile API v1 (protected)
GET /api/mobile/v1/health
Auth: x-api-key erforderlich
Rate Limit: best-effort (Phase 1), per ApiKey

Response (200):

json
Code kopieren
{
  "ok": true,
  "data": { "scope": "mobile", "status": "ok", "now": "2026-01-09T00:00:00.000Z" },
  "traceId": "..."
}
Errors: 401, 429

GET /api/mobile/v1/forms
Auth: x-api-key erforderlich
Semantik: liefert nur assigned + ACTIVE Forms für das Device

Response (200) – data ist eine Liste:

json
Code kopieren
{
  "ok": true,
  "data": [
    { "id": "form_demo_1", "name": "Demo Lead Capture", "description": "…", "status": "ACTIVE" }
  ],
  "traceId": "..."
}
Errors: 401, 429

GET /api/mobile/v1/forms/:id
Auth: x-api-key erforderlich
Semantik:

404 wenn Form nicht existiert oder nicht assigned (leak-safe)

Fields sind sortiert (nach sortOrder)

Response (200):

json
Code kopieren
{
  "ok": true,
  "data": {
    "id": "form_demo_1",
    "name": "Demo Lead Capture",
    "description": "…",
    "status": "ACTIVE",
    "fields": [
      { "id": "…", "key": "firstName", "label": "First name", "type": "TEXT", "required": true, "sortOrder": 10 }
    ]
  },
  "traceId": "..."
}
Errors: 401, 404, 429

POST /api/mobile/v1/leads
Auth: x-api-key erforderlich
Semantik:

404 wenn formId nicht existiert oder nicht assigned (leak-safe)

Idempotent via (tenantId, clientLeadId) → deduped: true bei Retry

Request Body:

json
Code kopieren
{
  "formId": "form_demo_1",
  "clientLeadId": "unique-per-device-or-app",
  "capturedAt": "2026-01-09T10:00:00.000Z",
  "values": { "firstName": "Test", "lastName": "User", "email": "t@example.com" },
  "meta": { "source": "mobile" }
}
Response (200):

json
Code kopieren
{ "ok": true, "data": { "leadId": "…", "deduped": false }, "traceId": "..." }
Errors: 400 INVALID_BODY, 401, 404, 429

Admin API v1 (tenant-scoped)
Forms
GET /api/admin/v1/forms
Auth: Session erforderlich
Query:

status: DRAFT|ACTIVE|ARCHIVED (optional)

q: search in name (optional)

Response (200) – backward compatible:

json
Code kopieren
{
  "ok": true,
  "data": {
    "forms": [ { "id":"...", "name":"...", "status":"ACTIVE", "fieldsCount": 4 } ],
    "items": [ { "id":"...", "name":"...", "status":"ACTIVE", "fieldsCount": 4 } ]
  },
  "traceId": "..."
}
POST /api/admin/v1/forms
Body:

json
Code kopieren
{ "name": "My Form", "description": "optional", "status": "DRAFT", "config": {} }
Response (201):

json
Code kopieren
{ "ok": true, "data": { "id": "...", "name": "My Form", "status": "DRAFT" }, "traceId": "..." }
Mobile Ops (Admin) — TP 2.9 (Ops-ready)
ApiKeys
GET /api/admin/v1/mobile/keys
Response (200):

json
Code kopieren
{
  "ok": true,
  "data": [
    { "id":"...", "name":"...", "prefix":"...", "status":"ACTIVE", "createdAt":"...", "lastUsedAt":"..." }
  ],
  "traceId": "..."
}
POST /api/admin/v1/mobile/keys
Erstellt einen neuen ApiKey (Klartext nur einmalig im Response).
Body (MVP):

json
Code kopieren
{ "name": "Messe iPad 1", "deviceName": "iPad Eingang" }
Response (201/200) – one-time token:

json
Code kopieren
{
  "ok": true,
  "data": { "id": "...", "prefix": "lrk_8d48c9b3", "apiKey": "lrk_....", "createdAt": "..." },
  "traceId": "..."
}
POST /api/admin/v1/mobile/keys/:id/revoke
Response (200):

json
Code kopieren
{ "ok": true, "data": { "id":"...", "status":"REVOKED", "revokedAt":"..." }, "traceId": "..." }
Devices
GET /api/admin/v1/mobile/devices
Response (200):

json
Code kopieren
{
  "ok": true,
  "data": [
    {
      "id":"...",
      "name":"...",
      "status":"ACTIVE",
      "lastSeenAt":"...",
      "apiKeyPrefix":"lrk_8d48c9b3",
      "assignedForms":[ { "id":"...", "name":"...", "status":"ACTIVE" } ]
    }
  ],
  "traceId":"..."
}
GET /api/admin/v1/mobile/devices/:id
Response (200):

json
Code kopieren
{
  "ok": true,
  "data": {
    "id":"...",
    "name":"...",
    "status":"ACTIVE",
    "lastSeenAt":"...",
    "apiKey": { "prefix":"...", "lastUsedAt":"..." },
    "assignedForms":[ { "id":"...", "name":"...", "status":"ACTIVE" } ]
  },
  "traceId":"..."
}
PATCH /api/admin/v1/mobile/devices/:id
Body:

json
Code kopieren
{ "name": "iPad Eingang", "status": "ACTIVE" }
Assignments (Replace strategy)
PUT /api/admin/v1/mobile/devices/:id/assignments
Body:

json
Code kopieren
{ "formIds": ["form_demo_1", "form_demo_2"] }
Response (200):

json
Code kopieren
{
  "ok": true,
  "data": { "id":"...", "assignedFormIds":["form_demo_1","form_demo_2"] },
  "traceId":"..."
}
Compatibility (legacy):

PUT /api/admin/v1/mobile/devices/:id/forms (falls im Code noch vorhanden)

Platform (minimal)
GET /api/platform/v1/health
Public Health endpoint. Standard Responses + traceId.
