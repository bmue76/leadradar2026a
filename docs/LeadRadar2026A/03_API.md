# LeadRadar2026A – API (Admin/Mobile/Platform)

Stand: 2026-01-06  
Prinzipien: tenant-scoped, leak-safe (falscher Tenant/ID => 404), Standard Responses + traceId.

---

## Base Paths

- Admin API: `/api/admin/v1/*`
- Mobile API: `/api/mobile/v1/*`
- Platform: `/api/platform/v1/*`

Versionierung ist Bestandteil des Pfads (v1).

---

## Standard Responses

### Success
- HTTP Status: 200 (oder passend, z.B. 201 bei Create)
- Header: `x-trace-id: <uuid>`
- Body:
```json
{ "ok": true, "data": { "...": "..." }, "traceId": "..." }
Error
HTTP Status: z.B. 400/401/404/409/429/500

Header: x-trace-id: <uuid>

Body:

json
Code kopieren
{
  "ok": false,
  "error": { "code": "SOME_CODE", "message": "Human readable", "details": { } },
  "traceId": "..."
}
Common Headers
content-type: application/json

x-trace-id (Response Header; identisch zum traceId im Body)

Error Codes (konzeptionell)
VALIDATION_ERROR (400)

UNAUTHORIZED (401) – fehlender/ungültiger Login (Admin) oder fehlender/ungültiger ApiKey (Mobile)

NOT_FOUND (404) – leak-safe bei falschem Tenant/ID oder unassigned Form

UNIQUE_CONFLICT (409) – Unique Constraint (z.B. Prisma P2002)

RATE_LIMITED (429) – best-effort Rate Limiting (Phase 1)

INTERNAL_ERROR / INTERNAL (500)

Hinweis: Exakte Codes sind endpoint-spezifisch; Guideline ist Stabilität der Codes und keine Leaks.

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
  "data": { "scope": "mobile", "status": "ok", "now": "2026-01-06T21:10:26.671Z" },
  "traceId": "..."
}
Errors:

401 UNAUTHORIZED

429 RATE_LIMITED

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
Errors:

401 UNAUTHORIZED

429 RATE_LIMITED

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
Errors:

401 UNAUTHORIZED

404 NOT_FOUND

429 RATE_LIMITED

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
  "capturedAt": "2026-01-06T10:00:00.000Z",
  "values": { "firstName": "Test", "lastName": "User", "email": "t@example.com" },
  "meta": { "source": "mobile" }
}
Response (200):

json
Code kopieren
{ "ok": true, "data": { "leadId": "…", "deduped": false }, "traceId": "..." }
Errors:

400 VALIDATION_ERROR

401 UNAUTHORIZED

404 NOT_FOUND

429 RATE_LIMITED

Admin API v1 (tenant-scoped)
Forms
GET /api/admin/v1/forms
Auth: Session erforderlich
Query:

status: DRAFT|ACTIVE|ARCHIVED (optional)

q: search in name (optional)

Response (200) – backward compatible + array alias:

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
{ "name": "My Form", "description": "optional", "status": "DRAFT", "config": { } }
Response (201):

json
Code kopieren
{ "ok": true, "data": { "id": "...", "name": "My Form", "status": "DRAFT" }, "traceId": "..." }
Mobile Management (TP 2.5)
ApiKeys
POST /api/admin/v1/mobile/keys
Erstellt einen neuen ApiKey (Klartext nur einmalig im Response).

Body:

json
Code kopieren
{ "name": "Messe iPad 1", "deviceName": "iPad Eingang" }
Response (201/200):

json
Code kopieren
{
  "ok": true,
  "data": { "id": "...", "prefix": "abcd1234", "apiKey": "<cleartext-once>", "createdAt": "..." },
  "traceId": "..."
}
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
POST /api/admin/v1/mobile/keys/:id/revoke
Response (200):

json
Code kopieren
{ "ok": true, "data": { "id":"...", "status":"REVOKED" }, "traceId": "..." }
Devices
POST /api/admin/v1/mobile/devices
Body:

json
Code kopieren
{ "name": "iPad Stand", "apiKeyId": "..." }
Response (201/200):

json
Code kopieren
{ "ok": true, "data": { "id":"...", "name":"...", "apiKeyId":"...", "status":"ACTIVE" }, "traceId":"..." }
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
      "apiKeyPrefix":"abcd1234",
      "assignedForms":[ { "id":"...", "name":"...", "status":"ACTIVE" } ]
    }
  ],
  "traceId":"..."
}
PUT /api/admin/v1/mobile/devices/:id/forms (replace strategy)
Body:

json
Code kopieren
{ "formIds": ["form_demo_1", "form_demo_2"] }
Response (200):

json
Code kopieren
{ "ok": true, "data": { "id":"...", "assignedFormIds":["form_demo_1","form_demo_2"] }, "traceId":"..." }
Platform (minimal)
GET /api/platform/v1/health
Public (typisch) – Status endpoint für Plattform/Infra Checks.
(Details je nach Implementation; Standard Responses + traceId gelten auch hier.)

