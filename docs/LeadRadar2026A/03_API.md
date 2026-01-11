# LeadRadar2026A – API (Admin/Mobile/Platform)

Stand: 2026-01-09  
Prinzipien: tenant-scoped, leak-safe (falscher Tenant/ID => 404), Standard Responses + traceId, Zod-only Validation.

---

## Base Paths

- Admin API: `/api/admin/v1/*`
- Mobile API: `/api/mobile/v1/*`
- Platform API: `/api/platform/v1/*`

Versionierung ist Bestandteil des Pfads (`v1`).

---

## Standard Responses (verbindlich)

### Success
Header:
- `x-trace-id: <uuid>`

Body:
```json
{ "ok": true, "data": { "...": "..." }, "traceId": "..." }
Error
Header:

x-trace-id: <uuid>

Body:

json
Code kopieren
{
  "ok": false,
  "error": { "code": "SOME_CODE", "message": "Human readable", "details": {} },
  "traceId": "..."
}
Common Header:

content-type: application/json; charset=utf-8

Error Codes (Guideline)

INVALID_BODY / INVALID_QUERY (400) — Zod Validation

UNAUTHORIZED (401) — fehlender/ungültiger Login (Admin) oder ApiKey (Mobile)

NOT_FOUND (404) — leak-safe bei falschem Tenant/ID oder unassigned Form

INVALID_STATE (409) — Admin: Zustand erlaubt Aktion nicht (z.B. revoke nur ACTIVE)

RATE_LIMITED (429) — best-effort Rate Limiting (Phase 1)

INTERNAL_ERROR (500)

Hinweis: Codes sind endpoint-spezifisch, aber Stabilität + keine Leaks sind Pflicht.

Auth
Admin Auth (Session)
Admin Endpoints sind session-protected (Login/Logout via /api/auth/*).
Tenant Context ist serverseitig enforced (tenant-scoped Zugriff). Bei falschem Tenant/ID => 404 (leak-safe).

Mobile Auth (ApiKey) — TP 2.5
Alle /api/mobile/v1/* Endpoints ausser Provisioning Claim erfordern einen gültigen ApiKey:

Header:

x-api-key: <token>

Eigenschaften:

ApiKey gehört zu genau einem Tenant

Speicherung in DB: nur Hash (HMAC-SHA256) + prefix, niemals Klartext

Klartext Key wird nur einmalig bei Erstellung angezeigt (Admin Create)

Fehlerverhalten:

missing/invalid/revoked => 401 UNAUTHORIZED

form nicht assigned => 404 NOT_FOUND (leak-safe)

rate limited => 429 RATE_LIMITED

Mobile API v1 (protected)
GET /api/mobile/v1/health
Auth: x-api-key erforderlich
Errors: 401, 429

Response (200):

json
Code kopieren
{
  "ok": true,
  "data": { "scope": "mobile", "status": "ok", "now": "2026-01-09T00:00:00.000Z" },
  "traceId": "..."
}
GET /api/mobile/v1/forms
Auth: x-api-key erforderlich
Semantik: liefert nur assigned + ACTIVE Forms für das Device
Errors: 401, 429

Response (200) — data ist eine Liste:

json
Code kopieren
{
  "ok": true,
  "data": [
    { "id": "form_demo_1", "name": "Demo Lead Capture", "description": "…", "status": "ACTIVE" }
  ],
  "traceId": "..."
}
GET /api/mobile/v1/forms/:id
Auth: x-api-key erforderlich
Semantik:

404 wenn Form nicht existiert oder nicht assigned (leak-safe)

Fields sortiert (nach sortOrder)

Errors: 401, 404, 429

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
POST /api/mobile/v1/leads
Auth: x-api-key erforderlich
Semantik:

404 wenn formId nicht existiert oder nicht assigned (leak-safe)

Idempotent via (tenantId, clientLeadId) → deduped: true bei Retry

Errors: 400 INVALID_BODY, 401, 404, 429

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
Mobile Provisioning (TP 3.0 / TP 3.1)
Ziel: Device-Onboarding ohne manuelles Copy/Paste.

POST /api/mobile/v1/provision/claim
Auth: kein x-api-key (nur Provision Token)
Zod: token (trim), deviceName? (trim)

Semantik:

Single-use garantiert (race-safe): genau 1 erfolgreicher Claim pro Token.

invalid / expired / used / revoked => 401 INVALID_PROVISION_TOKEN (strict, leak-safe)

rate limited => 429 RATE_LIMITED

success => erstellt MobileApiKey + MobileDevice + optional Assignments, markiert Token atomar als USED.

Request:

json
Code kopieren
{ "token": "prov_....", "deviceName": "iPad Eingang (optional)" }
Response (200):

json
Code kopieren
{
  "ok": true,
  "data": {
    "device": { "id": "...", "name": "...", "status": "ACTIVE" },
    "apiKey": { "id": "...", "prefix": "...", "status": "ACTIVE" },
    "token": "lrk_....",
    "assignedFormIds": ["..."]
  },
  "traceId": "..."
}
Admin API v1 (tenant-scoped)
Forms
GET /api/admin/v1/forms
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
Mobile Ops (Admin) — TP 2.9 (Ops-ready)
ApiKeys
GET /api/admin/v1/mobile/keys (200)
json
Code kopieren
{
  "ok": true,
  "data": [
    { "id":"...", "name":"...", "prefix":"...", "status":"ACTIVE", "createdAt":"...", "lastUsedAt":"..." }
  ],
  "traceId": "..."
}
POST /api/admin/v1/mobile/keys (one-time token)
json
Code kopieren
{
  "ok": true,
  "data": { "id": "...", "prefix": "lrk_8d48c9b3", "apiKey": "lrk_....", "createdAt": "..." },
  "traceId": "..."
}
POST /api/admin/v1/mobile/keys/:id/revoke (200)
json
Code kopieren
{ "ok": true, "data": { "id":"...", "status":"REVOKED", "revokedAt":"..." }, "traceId": "..." }
Devices
GET /api/admin/v1/mobile/devices (200)
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
PATCH /api/admin/v1/mobile/devices/:id (Body)
json
Code kopieren
{ "name": "iPad Eingang", "status": "ACTIVE" }
Assignments (Replace strategy)
PUT /api/admin/v1/mobile/devices/:id/assignments (Body { "formIds": ["..."] })

Legacy compatibility: PUT /api/admin/v1/mobile/devices/:id/forms

Admin Provisioning (TP 3.0 / TP 3.1)
POST /api/admin/v1/mobile/provision-tokens (Body)
json
Code kopieren
{
  "deviceName": "Messe iPad (optional)",
  "formIds": ["..."],
  "expiresInMinutes": 30
}
Response (200):

json
Code kopieren
{
  "ok": true,
  "data": {
    "provision": { "id":"...", "prefix":"...", "status":"ACTIVE", "expiresAt":"...", "createdAt":"..." },
    "token": "prov_...."
  },
  "traceId":"..."
}
GET /api/admin/v1/mobile/provision-tokens
status kann API-seitig computed EXPIRED sein (wenn expiresAt <= now und DB-status noch ACTIVE).

Response (200):

json
Code kopieren
{
  "ok": true,
  "data": {
    "items": [
      { "id":"...", "prefix":"...", "status":"ACTIVE", "expiresAt":"...", "createdAt":"...", "usedAt":null, "usedByDeviceId": null }
    ],
    "nextCursor": null
  },
  "traceId":"..."
}
POST /api/admin/v1/mobile/provision-tokens/:id/revoke
erlaubt nur wenn status == ACTIVE und nicht expired

sonst: 409 INVALID_STATE

Response (200):

json
Code kopieren
{
  "ok": true,
  "data": { "provision": { "id":"...", "status":"REVOKED" } },
  "traceId":"..."
}
Platform (minimal)
GET /api/platform/v1/health
Public Health endpoint. Standard Responses + traceId.

Exports (CSV) — TP 1.8 + TP 3.4 (event-aware)
POST /api/admin/v1/exports/csv
Erstellt einen CSV Export Job (Scope: Leads) und verarbeitet ihn best-effort inline (MVP).

Leak-safe:

Wenn eventId oder formId angegeben und nicht im Tenant existiert → 404 NOT_FOUND.

Request Body:

json
Code kopieren
{
  "eventId": "evt_... (optional)",
  "formId": "frm_... (optional)",
  "from": "2026-01-09 (optional, YYYY-MM-DD or ISO)",
  "to": "2026-01-10 (optional, YYYY-MM-DD or ISO)",
  "includeDeleted": false,
  "limit": 10000
}
Response (200):

json
Code kopieren
{
  "ok": true,
  "data": { "job": { "id":"...", "status":"DONE", "params": { "...": "..." } } },
  "traceId": "..."
}
Errors:

404 NOT_FOUND (eventId/formId wrong tenant or not existing)

500 EXPORT_FAILED

CSV Columns (stable, deterministic)
Delimiter: ; (Excel-friendly, CH)

Header order:

leadId

eventId (leer wenn null)

formId

capturedAt (ISO)

isDeleted

deletedAt (ISO oder leer)

deletedReason (oder leer)

values_json (stringified JSON, quoted/escaped)
