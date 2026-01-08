# LeadRadar2026A – API (Admin/Mobile/Platform)

Stand: 2026-01-08  
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

{
  "ok": false,
  "error": { "code": "SOME_CODE", "message": "Human readable", "details": {} },
  "traceId": "..."
}

Common Headers

content-type: application/json

x-trace-id (Response Header; identisch zum traceId im Body)

Error Codes (konzeptionell)

INVALID_BODY / INVALID_QUERY (400) – Zod Validation failed

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

Header:

x-api-key: <token>

Semantik:

ApiKey gehört zu genau einem Tenant

Speicherung in DB: nur Hash + prefix, niemals Klartext

Klartext Key wird nur einmalig bei Erstellung angezeigt (Admin Create / Admin UI)

Fehlerverhalten (Guideline):

missing/invalid/revoked key => 401 UNAUTHORIZED

form not assigned => 404 NOT_FOUND (leak-safe)

rate limited => 429 RATE_LIMITED

Mobile API v1 (protected)
GET /api/mobile/v1/health

Auth: x-api-key erforderlich
Rate Limit: best-effort (Phase 1), per ApiKey

Response (200):

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
Ops: aktualisiert MobileApiKey.lastUsedAt und MobileDevice.lastSeenAt (best-effort).

Response (200) – data ist eine Liste:

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

{
  "formId": "form_demo_1",
  "clientLeadId": "unique-per-device-or-app",
  "capturedAt": "2026-01-06T10:00:00.000Z",
  "values": { "firstName": "Test", "lastName": "User", "email": "t@example.com" },
  "meta": { "source": "mobile" }
}


Response (200):

{ "ok": true, "data": { "leadId": "…", "deduped": false }, "traceId": "..." }


Errors:

400 INVALID_BODY

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

{ "name": "My Form", "description": "optional", "status": "DRAFT", "config": {} }


Response (201):

{ "ok": true, "data": { "id": "...", "name": "My Form", "status": "DRAFT" }, "traceId": "..." }

Admin Mobile Ops (TP 2.5 + TP 2.9)

Ziel: ApiKeys & Devices operativ verwalten, Forms zuweisen (replace), Demo Capture damit nutzen.

DTOs (konzeptionell)
ApiKeyDto
{
  "id": "ckey_...",
  "prefix": "lrk_abcd",
  "label": "Messe iPad 1",
  "status": "ACTIVE",
  "createdAt": "2026-01-08T12:00:00.000Z",
  "revokedAt": null,
  "lastUsedAt": null,
  "device": { "id": "cdev_...", "name": "iPad Eingang", "status": "ACTIVE", "lastSeenAt": null }
}

DeviceRow
{
  "id": "cdev_...",
  "name": "iPad Stand",
  "status": "ACTIVE",
  "lastSeenAt": "2026-01-08T12:00:00.000Z",
  "createdAt": "2026-01-08T11:00:00.000Z",
  "apiKeyPrefix": "lrk_abcd",
  "apiKeyStatus": "ACTIVE",
  "lastUsedAt": "2026-01-08T12:00:00.000Z",
  "assignedFormsCount": 2
}

ApiKeys
GET /api/admin/v1/mobile/keys

Response (200):

{
  "ok": true,
  "data": { "items": [ /* ApiKeyDto[] */ ] },
  "traceId": "..."
}

POST /api/admin/v1/mobile/keys

Erstellt einen neuen ApiKey. Klartext-Key wird nur einmalig als token zurückgegeben.

Body:

{ "label": "Messe iPad 1", "createDevice": true, "deviceName": "iPad Eingang" }


Response (200):

{
  "ok": true,
  "data": { "apiKey": { /* ApiKeyDto */ }, "token": "lrk_..." },
  "traceId": "..."
}

POST /api/admin/v1/mobile/keys/:id/revoke

Response (200):

{
  "ok": true,
  "data": { "apiKey": { /* ApiKeyDto (status=REVOKED) */ } },
  "traceId": "..."
}


Errors (typisch):

401 TENANT_REQUIRED / UNAUTHORIZED

404 NOT_FOUND (leak-safe)

400 INVALID_BODY

500 INTERNAL

Devices
GET /api/admin/v1/mobile/devices

Response (200):

{
  "ok": true,
  "data": { "items": [ /* DeviceRow[] */ ] },
  "traceId": "..."
}

POST /api/admin/v1/mobile/devices

Body:

{ "name": "iPad Stand", "apiKeyId": "ckey_..." }


Response (200):

{
  "ok": true,
  "data": { "device": { /* DeviceRow */ } },
  "traceId": "..."
}

GET /api/admin/v1/mobile/devices/:id

Response (200):

{
  "ok": true,
  "data": {
    "device": { "id":"...", "name":"...", "status":"ACTIVE", "lastSeenAt":"...", "createdAt":"...", "apiKey": { "id":"...", "prefix":"...", "status":"ACTIVE", "lastUsedAt":"..." } },
    "assignedForms": [ { "id":"...", "name":"...", "status":"ACTIVE", "createdAt":"...", "assignedAt":"..." } ]
  },
  "traceId": "..."
}

PATCH /api/admin/v1/mobile/devices/:id

Body:

{ "name": "iPad Eingang (neu)", "status": "DISABLED" }


Response (200):

{
  "ok": true,
  "data": { "device": { "id":"...", "name":"...", "status":"DISABLED", "lastSeenAt":"...", "createdAt":"...", "apiKey": { "id":"...", "prefix":"...", "status":"ACTIVE", "lastUsedAt":"..." } } },
  "traceId": "..."
}

Assignments (Replace Strategy)
PUT /api/admin/v1/mobile/devices/:id/assignments

Body:

{ "formIds": ["form_demo_1", "form_demo_2"] }


Response (200):

{
  "ok": true,
  "data": { "deviceId":"...", "assignedForms":[ { "id":"...", "name":"...", "status":"ACTIVE", "createdAt":"...", "assignedAt":"..." } ] },
  "traceId": "..."
}


Semantik:

Replace: bestehende Assignments werden zuerst gelöscht, dann neue gesetzt.

Tenant-safe: fremde IDs => 404.

Forms List (für Assignments UI)
GET /api/admin/v1/mobile/forms?status=ACTIVE|DRAFT|ARCHIVED|ALL

Default: ACTIVE

Response (200):

{
  "ok": true,
  "data": { "items": [ { "id":"...", "name":"...", "status":"ACTIVE", "createdAt":"..." } ] },
  "traceId": "..."
}


