# LeadRadar2026A – API (Admin/Mobile/Platform)

Stand: 2026-01-13  
Prinzipien: tenant-scoped, leak-safe (falscher Tenant/ID => 404), Standard Responses + traceId, Zod-only Validation.

---

## Base Paths

- Admin API: `/api/admin/v1/*`
- Mobile API: `/api/mobile/v1/*`
- Platform API: `/api/platform/v1/*`

Versionierung ist Bestandteil des Pfads (`v1`).

---

## Standard Responses (verbindlich)

### Success (200..299)

Header:
- `x-trace-id: <uuid>`

Body:
```json
{ "ok": true, "data": { "...": "..." }, "traceId": "..." }
Error (4xx/5xx)
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
Error Codes (Guideline)
INVALID_BODY / INVALID_QUERY (400) — Zod Validation

BAD_JSON (400) — invalid JSON parse

UNAUTHORIZED (401) — fehlender/ungültiger Login (Admin) oder ApiKey (Mobile)

TENANT_REQUIRED (401) — fehlender Tenant Context (x-tenant-slug) wo erforderlich

NOT_FOUND (404) — leak-safe bei falschem Tenant/ID oder unassigned Form

INVALID_STATE (409) — Zustand erlaubt Aktion nicht

EVENT_NOT_ACTIVE (409) — Device Binding darf nur auf ACTIVE Event zeigen (TP 3.7)

UNSUPPORTED_MEDIA_TYPE (415) — z.B. Attachment Upload mime nicht erlaubt

BODY_TOO_LARGE (413) — Upload/Body zu groß

RATE_LIMITED (429) — best-effort Rate Limiting (Phase 1)

INTERNAL (500) — unexpected

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

GET /api/mobile/v1/forms/:id
Auth: x-api-key erforderlich
Semantik:

404 wenn Form nicht existiert oder nicht assigned (leak-safe)

Fields sortiert (nach sortOrder)

Errors: 401, 404, 429

POST /api/mobile/v1/leads
Auth: x-api-key erforderlich
Semantik:

404 wenn formId nicht existiert oder nicht assigned (leak-safe)

Idempotent via (tenantId, clientLeadId) → deduped: true bei Retry

Errors: 400 INVALID_BODY, 401, 404, 429

Mobile API v1 — Lead Attachments (TP 3.5)
POST /api/mobile/v1/leads/:id/attachments
Auth: x-api-key erforderlich
Leak-safe:

404 wenn Lead nicht im Tenant existiert

Content-Type: multipart/form-data
Form Fields:

file (required)

type (optional) — BUSINESS_CARD_IMAGE | IMAGE | PDF | OTHER (default BUSINESS_CARD_IMAGE)

Limits:

max size: 6MB

mime allowlist (MVP): image/jpeg, image/png, image/webp

Errors: 401, 404, 413, 415, 429

Storage (DEV stub):

.tmp_attachments/<tenantId>/<leadId>/<attachmentId>.<ext>

Mobile Provisioning (TP 3.0 / TP 3.1)
POST /api/mobile/v1/provision/claim
Auth: kein x-api-key (nur Provision Token)
Zod: token (trim), deviceName? (trim)

Semantik:

Single-use garantiert (race-safe): genau 1 erfolgreicher Claim pro Token

invalid / expired / used / revoked => 401 INVALID_PROVISION_TOKEN (strict, leak-safe)

rate limited => 429 RATE_LIMITED

success => erstellt MobileApiKey + MobileDevice + optional Assignments, markiert Token atomar als USED.

Admin API v1 (tenant-scoped)
Forms
GET /api/admin/v1/forms
Query: status=DRAFT|ACTIVE|ARCHIVED (optional), q (optional)

Admin API v1 — Events (TP 3.3 + TP 3.7/3.8 Guardrails)
GET /api/admin/v1/events
Query:

status (optional): DRAFT|ACTIVE|ARCHIVED

limit (optional, default 200, max 500)

includeCounts (optional): true|1 → erweitert Items um boundDevicesCount

Response (200) ohne Counts:

json
Code kopieren
{
  "ok": true,
  "data": {
    "items": [
      { "id":"...", "name":"Swissbau 2026", "status":"ACTIVE", "startsAt":"...", "endsAt":"...", "createdAt":"...", "updatedAt":"..." }
    ]
  },
  "traceId": "..."
}
Response (200) mit Counts (includeCounts=true):

json
Code kopieren
{
  "ok": true,
  "data": {
    "items": [
      {
        "id":"...",
        "name":"Swissbau 2026",
        "status":"ACTIVE",
        "startsAt":"...",
        "endsAt":"...",
        "createdAt":"...",
        "updatedAt":"...",
        "boundDevicesCount": 3
      }
    ]
  },
  "traceId": "..."
}
boundDevicesCount = Anzahl MobileDevice mit activeEventId=<eventId> im selben Tenant (nur Count, keine heavy Joins).

GET /api/admin/v1/events/active
Semantik:

Defensive: sollte max 1 sein, nimmt bei Inkonsistenz das zuletzt aktualisierte ACTIVE Event.

Liefert item oder null.

TP 3.9 UI Nutzung: Mobile Ops verwendet diesen Endpoint als Single Source of Truth für den aktiven Messekontext.

Wenn kein ACTIVE Event existiert: empfohlen 200 mit data.item = null.

Falls Implementierung 404 NOT_FOUND liefert, behandelt die UI das non-breaking als “kein aktives Event”.

Response (200):

json
Code kopieren
{
  "ok": true,
  "data": { "item": { "id":"...", "tenantId":"...", "name":"...", "status":"ACTIVE", "updatedAt":"..." } },
  "traceId": "..."
}
PATCH /api/admin/v1/events/:id/status
Body:

json
Code kopieren
{ "status": "DRAFT" | "ACTIVE" | "ARCHIVED" }
Guardrails (TP 3.7):

Max. 1 ACTIVE Event pro Tenant (MVP): Wenn ein Event auf ACTIVE gesetzt wird, werden alle anderen ACTIVE Events im selben Tenant automatisch auf ARCHIVED gesetzt.

Auto-unbind: Wenn ein Event von ACTIVE weg wechselt (DRAFT/ARCHIVED) oder automatisch archiviert wird, werden alle Devices mit activeEventId=<eventId> automatisch auf null gesetzt.

Leads bleiben historisch korrekt mit lead.eventId getaggt.

Errors:

401 UNAUTHORIZED (Admin Session)

404 NOT_FOUND (leak-safe: falscher Tenant/ID)

409 INVALID_STATE / EVENT_NOT_ACTIVE (kontextabhängig)

Response (200):

json
Code kopieren
{
  "ok": true,
  "data": {
    "item": { "id":"...", "name":"...", "status":"ACTIVE", "updatedAt":"..." },
    "autoArchivedEventId": "evt_...",
    "devicesUnboundCount": 2
  },
  "traceId": "..."
}
autoArchivedEventId ist null, wenn kein anderes ACTIVE Event existierte.
devicesUnboundCount ist immer eine Zahl (0..n).

POST /api/admin/v1/events/:id/unbind-devices (Ops Action, optional)
Semantik:

Setzt mobileDevice.activeEventId für dieses Event auf null.

Liefert devicesUnboundCount.

Errors:

401 UNAUTHORIZED

404 NOT_FOUND (leak-safe)

Response (200):

json
Code kopieren
{
  "ok": true,
  "data": { "eventId": "evt_...", "devicesUnboundCount": 3 },
  "traceId": "..."
}
Admin API v1 — Mobile Ops (TP 2.9 + TP 3.7)
Devices
PATCH /api/admin/v1/mobile/devices/:id
Body:

json
Code kopieren
{ "name": "iPad Eingang", "status": "ACTIVE", "activeEventId": "evt_..." }
Guardrail:

activeEventId darf nur auf ein ACTIVE Event im Tenant zeigen.

falscher Tenant/ID ⇒ 404 NOT_FOUND (leak-safe)

Event existiert aber nicht ACTIVE ⇒ 409 EVENT_NOT_ACTIVE

Admin API v1 — Lead Attachments (TP 3.5)
GET /api/admin/v1/leads/:id/attachments/:attachmentId/download
Leak-safe 404 bei falschem Tenant/Lead/Attachment
optional ?inline=1 für image preview

Exports (CSV) — TP 1.8 + TP 3.4 (event-aware)
POST /api/admin/v1/exports/csv
optional eventId, formId, date range
falscher Tenant/ID => 404 NOT_FOUND (leak-safe)
