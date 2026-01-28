# LeadRadar2026A – API (Admin/Mobile/Platform)

Stand: 2026-01-23  
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
Hinweis:

traceId ist immer im Body enthalten, zusätzlich via Header x-trace-id.

Leak-safety: falscher Tenant/ID => 404 NOT_FOUND (keine Info-Leaks).

Error Codes (Guideline)
INVALID_BODY / INVALID_QUERY (400) — Zod Validation

BAD_JSON (400) — invalid JSON parse

UNAUTHORIZED (401) — fehlender/ungültiger Login (Admin) oder ApiKey (Mobile)

TENANT_REQUIRED (401) — fehlender Tenant Context (x-tenant-slug) wo erforderlich

NOT_FOUND (404) — leak-safe bei falschem Tenant/ID oder unassigned Form

INVALID_STATE (409) — Zustand erlaubt Aktion nicht

EVENT_NOT_ACTIVE (409) — Device Binding darf nur auf ACTIVE Event zeigen (Guardrail)

UNSUPPORTED_MEDIA_TYPE (415) — z.B. Attachment Upload mime nicht erlaubt

BODY_TOO_LARGE (413) — Upload/Body zu groß

RATE_LIMITED (429) — best-effort Rate Limiting (Phase 1)

INTERNAL (500) — unexpected

Codes sind endpoint-spezifisch, aber Stabilität + keine Leaks sind Pflicht.

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
GET /api/mobile/v1/branding
Auth: x-api-key erforderlich
Semantik:

Liefert Tenant Branding für Mobile (MVP: Logo)

Rückgabe ist bewusst Mobile-friendly: logoDataUrl (data:...;base64,...) damit RN Image stabil rendern kann (ohne Header-Auth/Fetch-Komplexität)

Wenn Logo fehlt oder File im Storage nicht vorhanden: hasLogo=false und logoDataUrl=null

Errors: 401, 429

Response (200):

json
Code kopieren
{
  "ok": true,
  "data": {
    "branding": {
      "hasLogo": true,
      "logoMime": "image/png",
      "logoSizeBytes": 12345,
      "logoUpdatedAt": "2026-01-23T10:11:12.000Z"
    },
    "logoDataUrl": "data:image/png;base64,iVBORw0K..."
  },
  "traceId": "..."
}
Response (200) wenn kein Logo:

json
Code kopieren
{
  "ok": true,
  "data": {
    "branding": { "hasLogo": false },
    "logoDataUrl": null
  },
  "traceId": "..."
}
GET /api/mobile/v1/events/active
Auth: x-api-key erforderlich
Semantik:

Liefert das aktuell aktive Event (im Tenant-Kontext) oder null

Mobile UX: Home Screen zeigt Warn-Card wenn activeEvent=null

Errors: 401, 429

Response (200):

json
Code kopieren
{
  "ok": true,
  "data": {
    "activeEvent": {
      "id": "evt_...",
      "name": "Swissbau 2026",
      "startsAt": "2026-01-14T00:00:00.000Z",
      "endsAt": "2026-01-18T00:00:00.000Z",
      "location": "Basel"
    }
  },
  "traceId": "..."
}
Response (200) wenn kein ACTIVE Event:

json
Code kopieren
{
  "ok": true,
  "data": { "activeEvent": null },
  "traceId": "..."
}
GET /api/mobile/v1/forms
Auth: x-api-key erforderlich
Semantik:

Liefert nur assigned + ACTIVE Forms für das Device

Errors: 401, 429

Response (200):

json
Code kopieren
{
  "ok": true,
  "data": [
    { "id": "frm_1", "name": "Visitor Lead", "description": "Basic visitor lead", "status": "ACTIVE" },
    { "id": "frm_2", "name": "Product Interest", "description": null, "status": "ACTIVE" }
  ],
  "traceId": "..."
}
GET /api/mobile/v1/forms/:id
Auth: x-api-key erforderlich
Semantik:

404 wenn Form nicht existiert oder nicht assigned (leak-safe)

Fields sortiert (nach sortOrder)

Errors: 401, 404, 429

Response (200) (Beispiel, gekürzt):

json
Code kopieren
{
  "ok": true,
  "data": {
    "id": "frm_1",
    "name": "Visitor Lead",
    "fields": [
      { "id": "fld_1", "type": "text", "key": "company", "label": "Firma", "required": false, "sortOrder": 10 }
    ]
  },
  "traceId": "..."
}
GET /api/mobile/v1/stats/me?range=today&tzOffsetMinutes=<int>
Auth: x-api-key erforderlich
Semantik (MVP):

range=today ist aktuell vorgesehen (weiteres später möglich)

tzOffsetMinutes optional (z.B. -60), um “Today” sauber im Device-Zeitraum zu berechnen

Default Scope:

Wenn Device eine activeEventId gebunden hat: Stats beziehen sich auf dieses Event

Sonst: tenant-wide “today”

pendingAttachments (MVP Definition):

Anzahl BUSINESS_CARD_IMAGE Attachments “heute”, bei denen OCR/Contact-Apply noch nicht abgeschlossen ist

Stabil & pragmatisch (dokumentiert, kann später verfeinert werden)

todayHourlyBuckets optional (nur wenn günstig/leicht verfügbar)

Errors: 401, 429

Response (200):

json
Code kopieren
{
  "ok": true,
  "data": {
    "leadsToday": 7,
    "avgPerHour": 1.2,
    "pendingAttachments": 3,
    "todayHourlyBuckets": [
      { "hour": 9, "count": 2 },
      { "hour": 10, "count": 1 }
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

Response (200/201) (Beispiel):

json
Code kopieren
{
  "ok": true,
  "data": {
    "lead": { "id": "lead_...", "formId": "frm_1", "createdAt": "2026-01-23T10:15:00.000Z" },
    "deduped": false
  },
  "traceId": "..."
}
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

success => erstellt MobileApiKey + MobileDevice + optional Assignments, markiert Token atomar als USED

Admin API v1 (tenant-scoped)
Tenants (Current) / Branding
/api/admin/v1/tenants/current
Semantik:

Liefert Tenant-Metadaten (owner-only MVP)

/api/admin/v1/tenants/current/logo
Semantik:

Tenant Logo wird im Branding Storage abgelegt (DEV: .tmp_branding/...)

Kein Cropping/Resizing (MVP: passthrough)

Allowed: PNG/JPG/WebP (Server allowlist)

HEAD /api/admin/v1/tenants/current/logo
200 wenn Logo vorhanden, 404 wenn nicht

Sets ETag + Content-Type

GET /api/admin/v1/tenants/current/logo
Streamt das Logo (304 via If-None-Match möglich)

POST /api/admin/v1/tenants/current/logo
multipart/form-data mit file

Errors: 400 INVALID_FILE_TYPE, 413 BODY_TOO_LARGE, 401, 404 (leak-safe mismatch via header override)

DELETE /api/admin/v1/tenants/current/logo
entfernt Logo + DB Felder

Forms
GET /api/admin/v1/forms
Query:

status=DRAFT|ACTIVE|ARCHIVED (optional)

q (optional)

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
      {
        "id": "evt_...",
        "name": "Swissbau 2026",
        "status": "ACTIVE",
        "startsAt": "...",
        "endsAt": "...",
        "createdAt": "...",
        "updatedAt": "..."
      }
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
        "id": "evt_...",
        "name": "Swissbau 2026",
        "status": "ACTIVE",
        "startsAt": "...",
        "endsAt": "...",
        "createdAt": "...",
        "updatedAt": "...",
        "boundDevicesCount": 3
      }
    ]
  },
  "traceId": "..."
}
boundDevicesCount = Anzahl MobileDevice mit activeEventId=<eventId> im selben Tenant (nur Count, keine heavy Joins).

GET /api/admin/v1/events/active
Semantik:

Defensive: sollte max 1 sein, nimmt bei Inkonsistenz das zuletzt aktualisierte ACTIVE Event

Liefert item oder null

UI Nutzung: Mobile Ops verwendet diesen Endpoint als Single Source of Truth für den aktiven Messekontext

Wenn kein ACTIVE Event existiert: empfohlen 200 mit data.item=null.
Falls Implementierung 404 liefert, behandelt die UI das non-breaking als “kein aktives Event”.

Response (200):

json
Code kopieren
{
  "ok": true,
  "data": {
    "item": { "id": "evt_...", "tenantId": "...", "name": "...", "status": "ACTIVE", "updatedAt": "..." }
  },
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
    "item": { "id": "evt_...", "name": "...", "status": "ACTIVE", "updatedAt": "..." },
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
Optional: eventId, formId, date range
falscher Tenant/ID => 404 NOT_FOUND (leak-safe)

## Admin API v1 (session protected)

Alle Admin Endpoints nutzen Session-Cookie Auth (Login via `/api/auth/*`) und sind **tenant-scoped + leak-safe**:
- falscher Tenant / fremde ID => **404 NOT_FOUND**
- Standard Response `{ ok, data|error, traceId }` + Header `x-trace-id`

### Leads – OCR Review (Business Card) — TP 4.11

Ziel:
- Admin kann OCR Result pro Lead einsehen
- Parsed Contact korrigieren und speichern (correctedContactJson)
- Korrigierten (oder parsed) Contact auf `lead.contact_*` anwenden

#### GET /api/admin/v1/leads/:id/ocr

Semantik:
- Liefert OCR Panel Daten für den Lead:
  - **attachment**: primär `BUSINESS_CARD_IMAGE`, fallback erstes `image/*`
  - **ocr**: OCR Result inkl. rawText + parsedContactJson + correctedContactJson
- Wenn kein Business-Card Attachment vorhanden: `attachment=null`, `ocr=null` (ok=true)
- Leak-safe: falsche LeadId / fremder Tenant => 404

Errors: 401, 404, 429, 500

Response (200):
```json
{
  "ok": true,
  "data": {
    "attachment": {
      "id": "att_...",
      "type": "BUSINESS_CARD_IMAGE",
      "filename": "card.jpg",
      "mimeType": "image/jpeg",
      "sizeBytes": 12345
    },
    "ocr": {
      "id": "ocr_...",
      "status": "COMPLETED",
      "engine": "MLKIT",
      "engineVersion": "x.y.z",
      "mode": "BUSINESS_CARD",
      "confidence": 0.87,
      "rawText": "…",
      "parsedContactJson": { "firstName": "…", "email": "…" },
      "correctedContactJson": { "firstName": "…", "email": "…" },
      "createdAt": "…",
      "updatedAt": "…",
      "completedAt": "…",
      "errorCode": null,
      "errorMessage": null
    }
  },
  "traceId": "..."
}
Response (200) wenn kein Attachment:

json
Code kopieren
{ "ok": true, "data": { "attachment": null, "ocr": null }, "traceId": "..." }
PATCH /api/admin/v1/leads/:id/ocr
Semantik:

Speichert Admin-Korrekturen (correctedContactJson) zu einem OCR Result.

UI nutzt dies für „Save“ im OCR Panel.

Body:

json
Code kopieren
{
  "ocrResultId": "ocr_...",
  "correctedContact": {
    "firstName": "…",
    "lastName": "…",
    "email": "…",
    "phone": "…",
    "mobile": "…",
    "company": "…",
    "title": "…",
    "website": "…",
    "street": "…",
    "zip": "…",
    "city": "…",
    "country": "…"
  }
}
Hinweise:

leere Strings werden serverseitig als null normalisiert (empfohlen)

correctedAt/correctedByUserId werden gesetzt

Errors: 400, 401, 404, 429, 500

Response (200):

json
Code kopieren
{ "ok": true, "data": { "id": "ocr_..." }, "traceId": "..." }
POST /api/admin/v1/leads/:id/ocr/apply
Semantik:

Schreibt OCR Contact nach lead.contact_*:

Quelle: correctedContactJson falls vorhanden, sonst parsedContactJson

Setzt Export-Meta:

contactSource = "OCR"

contactUpdatedAt = now

contactOcrResultId = ocrResultId

Body:

json
Code kopieren
{ "ocrResultId": "ocr_..." }
Errors: 400, 401, 404, 409, 429, 500

Response (200):

json
Code kopieren
{ "ok": true, "data": { "id": "lead_..." }, "traceId": "..." }
