# LeadRadar2026A – API (Admin/Mobile/Platform)

Stand: 2026-02-25  
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
- `x-trace-id: <uuid|string>`

Body:
```json
{ "ok": true, "data": { "...": "..." }, "traceId": "..." }
Error (4xx/5xx)

Header:

x-trace-id: <uuid|string>

Body:

{
  "ok": false,
  "error": { "code": "SOME_CODE", "message": "Human readable", "details": {} },
  "traceId": "..."
}

Hinweise:

traceId ist immer im Body enthalten, zusätzlich via Header x-trace-id.

Leak-safety: falscher Tenant/ID => 404 NOT_FOUND (keine Info-Leaks).

Error Codes (Guideline)

INVALID_BODY / INVALID_QUERY (400) — Zod Validation

BAD_JSON (400) — invalid JSON parse

UNAUTHORIZED (401) — fehlender/ungültiger Login (Admin) oder ApiKey (Mobile)

TENANT_REQUIRED (401) — fehlender Tenant Context (z. B. x-tenant-slug) wo erforderlich

NOT_FOUND (404) — leak-safe bei falschem Tenant/ID oder nicht sichtbaren Ressourcen

INVALID_STATE (409) — Zustand erlaubt Aktion nicht

EVENT_NOT_ACTIVE (409) — Event ist nicht ACTIVE (Guardrail)

UNSUPPORTED_MEDIA_TYPE (415) — z.B. Attachment Upload mime nicht erlaubt

BODY_TOO_LARGE (413) — Upload/Body zu groß

RATE_LIMITED (429) — best-effort Rate Limiting (Phase 1)

INTERNAL / INTERNAL_ERROR (500) — unexpected

Codes sind endpoint-spezifisch, aber Stabilität + keine Leaks sind Pflicht.

Auth
Admin Auth (Session)

Admin Endpoints sind session-protected (Login/Logout via /api/auth/*).
Tenant Context ist serverseitig enforced (tenant-scoped Zugriff). Bei falschem Tenant/ID => 404 (leak-safe).

Mobile Auth (ApiKey) — TP 2.5

Alle /api/mobile/v1/* Endpoints ausser Provisioning Claim erfordern einen gültigen ApiKey.

Header:

x-api-key: <token> (bevorzugt)

optional legacy: x-mobile-api-key: <token>

Eigenschaften:

ApiKey gehört zu genau einem Tenant

Speicherung: nur Hash (HMAC-SHA256) + prefix, niemals Klartext

Klartext-Key wird nur einmalig angezeigt (Admin Create / Dev Script)

Fehlerverhalten:

missing/invalid/revoked => 401 INVALID_API_KEY (leak-safe)

rate limited => 429 RATE_LIMITED

Mobile API v1 (protected)
GET /api/mobile/v1/health

Auth: x-api-key erforderlich
Response:

{ "ok": true, "data": { "scope": "mobile", "status": "ok", "now": "..." }, "traceId": "..." }
GET /api/mobile/v1/branding

Auth: x-api-key erforderlich
Semantik: Liefert Tenant Branding für Mobile (MVP: Logo).
Rückgabe Mobile-friendly: logoDataUrl (data:...;base64,...) damit RN Image stabil rendert.

GET /api/mobile/v1/events/active (TP7.10)

Auth: x-api-key erforderlich
Semantik: Liefert 0..n ACTIVE Events im Tenant-Kontext.

Mobile UX:

0 => Info Screen „Keine aktive Messe“

1 => Auto-select → Formularauswahl

1 => Event Picker → danach Formularauswahl

GET /api/mobile/v1/forms?eventId=<id> (TP7.10)

Auth: x-api-key erforderlich
Query: eventId (required)

Semantik (MVP):
Liefert ACTIVE Forms, die für das ausgewählte Event sichtbar sind:

dem Event zugewiesen ODER

global (keine Event-Zuweisungen vorhanden)

GET /api/mobile/v1/forms/:id?eventId=<id> (TP7.10)

Auth: x-api-key erforderlich
Query: eventId (required)

Semantik:

404 wenn Form nicht existiert oder für dieses Event nicht sichtbar (leak-safe)

Fields sortiert (nach sortOrder)

POST /api/mobile/v1/leads (TP7.10)

Auth: x-api-key erforderlich
Body (MVP):

{
  "eventId": "evt_...",
  "formId": "frm_...",
  "clientLeadId": "uuid-or-client-id",
  "capturedAt": "2026-02-24T12:00:00.000Z",
  "values": { "company": "ACME", "email": "a@b.ch" },
  "meta": { "optional": "..." }
}

Semantik:

eventId required (selected event in Mobile)

eventId muss im Tenant existieren und ACTIVE sein, sonst 409 EVENT_NOT_ACTIVE oder 404 NOT_FOUND (leak-safe)

Form muss ACTIVE und für das eventId sichtbar sein, sonst 404 (leak-safe)

Idempotent via (tenantId, clientLeadId) → bei Retry deduped=true

Response:

{ "ok": true, "data": { "leadId": "lead_...", "deduped": false }, "traceId": "..." }
Mobile API v1 — Lead Attachments (TP 3.5)

POST /api/mobile/v1/leads/:id/attachments
Auth: x-api-key erforderlich
Leak-safe: 404 wenn Lead nicht im Tenant existiert
Content-Type: multipart/form-data

Form Fields:

file (required)

type (optional) — BUSINESS_CARD_IMAGE | IMAGE | PDF | OTHER (default BUSINESS_CARD_IMAGE)

Limits (MVP):

max size: 6MB

mime allowlist: image/jpeg, image/png, image/webp

Mobile Provisioning (TP 3.0 / TP 7.8)
POST /api/mobile/v1/provision/claim

Auth: kein x-api-key (nur Provision Token)

Semantik:

Single-use garantiert (race-safe): genau 1 erfolgreicher Claim pro Token

invalid / expired / used / revoked => 401 INVALID_PROVISION_TOKEN (leak-safe)

success => erstellt MobileApiKey + MobileDevice

Admin API v1 (tenant-scoped, session protected)
/api/admin/v1/tenants/current

Semantik: Liefert Tenant-Metadaten (owner-only MVP)

/api/admin/v1/tenants/current/logo

Semantik: Tenant Logo Storage (DEV: .tmp_branding/...)
Allowed: PNG/JPG/WebP

Events (TP 3.3)
GET /api/admin/v1/events

Query:

status (optional): DRAFT|ACTIVE|ARCHIVED

limit (optional, default 200, max 500)

includeCounts (optional): true|1 → Items um boundDevicesCount

PATCH /api/admin/v1/events/:id/status

Body: { "status": "DRAFT" | "ACTIVE" | "ARCHIVED" }

Guardrails (MVP):

Max. 1 ACTIVE Event pro Tenant (kann in TP7.10 auch >1 sein; Mobile nutzt /events/active Liste)

Auto-unbind Devices wenn ACTIVE wegfällt (falls device binding genutzt wird)

Forms — List / Assignments (TP7.10)
GET /api/admin/v1/forms

Query:

status = DRAFT|ACTIVE|ARCHIVED|ALL

q (optional)

sort = updatedAt|name

dir = asc|desc

assigned (deprecated, ignored)

eventId (deprecated für List-Filtering; wird nur für Readiness-Kontext genutzt)

Response liefert zusätzlich:

assignmentCount (0 => Global, 1 => genau ein Event, >1 => Multi)

assignedEventId (nur wenn assignmentCount===1, sonst null)

GET /api/admin/v1/forms/:id/assignments

Response:

{ "ok": true, "data": { "eventIds": ["evt_1","evt_2"] }, "traceId": "..." }
PUT /api/admin/v1/forms/:id/assignments

Body:

{ "eventIds": ["evt_1","evt_2"] }

Semantik:

[] => Global

Multi-Select möglich

tenant-scoped + leak-safe: fremde formId/eventId => 404

Leads – OCR Review (Business Card) — TP 4.11

GET /api/admin/v1/leads/:id/ocr

PATCH /api/admin/v1/leads/:id/ocr

POST /api/admin/v1/leads/:id/ocr/apply

(Details siehe TP 4.11 Doc / bestehende Implementierung)

Exports (CSV) — TP 1.8 + TP 3.4
POST /api/admin/v1/exports/csv

Optional: eventId, formId, date range
Leak-safe 404 bei falschem Tenant/ID

Statistik — Messe Performance Center (TP 8.2)
GET /api/admin/v1/statistics/events

Semantik:

Liefert Events für den Statistik-Screen (MVP: ACTIVE + ARCHIVED).

tenant-scoped, leak-safe.

Response:

{
  "ok": true,
  "data": {
    "events": [
      { "id": "evt_...", "name": "Swissbau 2026", "status": "ACTIVE", "startsAt": "...", "endsAt": "..." }
    ],
    "generatedAt": "..."
  },
  "traceId": "..."
}
GET /api/admin/v1/statistics

Polling-friendly (MVP):

Cache-Control: no-store

Response enthält generatedAt

Standard Responses + traceId

Query:

eventId (required)

from (ISO datetime, required)

to (ISO datetime, required)

compare = none|previous (default previous)

includeDeleted = 0|1 (default 0)

Semantik:

Aggregiert serverseitig: Headline, Traffic by hour, Devices ranking, Top Interests, Top Forms, Lead-Qualität.

Leak-safe: falscher Tenant / fremde eventId => 404 NOT_FOUND.

Response (Beispiel, gekürzt):

{
  "ok": true,
  "data": {
    "generatedAt": "2026-02-25T20:12:03.120Z",
    "event": { "id": "evt_...", "name": "Swissbau 2026", "status": "ACTIVE" },
    "range": { "from": "...", "to": "...", "compareLabel": "" },
    "headline": {
      "leadsTotal": 128,
      "deltaPct": 18.0,
      "qualifiedPct": 32,
      "devicesActiveCount": 4,
      "peakHourLabel": "14–15 Uhr",
      "liveAllowed": true
    },
    "traffic": { "byHour": [{ "hourStart": "...", "leads": 3, "leadsCompare": 2 }] },
    "devices": { "ranking": [{ "deviceId": "dev_1", "label": "iPad Sales", "leadsTotal": 42, "leadsPerHourAvg": 3.5 }] },
    "insights": {
      "topInterests": [{ "label": "Produkt A", "count": 48 }],
      "topForms": [{ "formId": "frm_1", "name": "Kontakt", "count": 73 }]
    },
    "quality": {
      "cardPct": 61,
      "notesPct": 24,
      "qualifiedPct": 32,
      "funnel": [
        { "label": "Erfasst", "count": 128 },
        { "label": "Mit Visitenkarte", "count": 78 },
        { "label": "Qualifiziert", "count": 41 }
      ]
    }
  },
  "traceId": "..."
}

