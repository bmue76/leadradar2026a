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
Common Headers
content-type: application/json; charset=utf-8

x-trace-id (Response Header; identisch zum traceId im Body)

Error Codes (Guideline)
INVALID_BODY / INVALID_QUERY (400) – Zod Validation

UNAUTHORIZED (401) – fehlender/ungültiger Login (Admin) oder ApiKey (Mobile)

NOT_FOUND (404) – leak-safe bei falschem Tenant/ID oder unassigned Form

RATE_LIMITED (429) – best-effort Rate Limiting (Phase 1)

INTERNAL_ERROR (500)

Hinweis: Codes sind endpoint-spezifisch, aber Stabilität + keine Leaks sind Pflicht.

Auth
Admin Auth (Session)
Admin Endpoints sind session-protected (Login/Logout via /api/auth/*).
Tenant Context ist serverseitig enforced (tenant-scoped Zugriff). Bei falschem Tenant/ID => 404.

Mobile Auth (ApiKey) — TP 2.5
Alle /api/mobile/v1/* Endpoints (ausser Provisioning Claim, siehe TP 3.0) erfordern einen gültigen ApiKey:

Header:

x-api-key: <token>

Eigenschaften:

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
GET /api/mobile/v1/forms/:id
Auth: x-api-key erforderlich
Semantik:

404 wenn Form nicht existiert oder nicht assigned (leak-safe)

Fields sind sortiert (nach sortOrder)

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
Mobile Provisioning (TP 3.0)
Ziel: Device-Onboarding ohne manuelles Copy/Paste.

POST /api/mobile/v1/provision/claim
Auth: kein x-api-key (nur Provision Token)
Semantik:

invalid/expired/used/revoked token → 401 INVALID_PROVISION_TOKEN (keine Leaks)

success → erstellt MobileApiKey + MobileDevice + optional Assignments

token wird atomar USED

Errors: 401, 500

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
    "token": "mkey_....",
    "assignedFormIds": ["..."]
  },
  "traceId": "..."
}
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

Admin Provisioning (TP 3.0)
POST /api/admin/v1/mobile/provision-tokens
Body:

json
Code kopieren
{
  "deviceName": "Messe iPad (optional)",
  "formIds": ["..."] ,
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
Response (200):

json
Code kopieren
{
  "ok": true,
  "data": {
    "items": [
      { "id":"...", "prefix":"...", "status":"ACTIVE", "expiresAt":"...", "createdAt":"...", "usedAt":null }
    ],
    "nextCursor": null
  },
  "traceId":"..."
}
POST /api/admin/v1/mobile/provision-tokens/:id/revoke
Response (200):

json
Code kopieren
{
  "ok": true,
  "data": {
    "provision": { "id":"...", "status":"REVOKED" }
  },
  "traceId":"..."
}
Platform (minimal)
GET /api/platform/v1/health
Public Health endpoint. Standard Responses + traceId.

EOF

yaml
Code kopieren

---

## 3) docs/LeadRadar2026A/04_RUNBOOK.md (ersetzen)

```bash
cat > "docs/LeadRadar2026A/04_RUNBOOK.md" <<'EOF'
# LeadRadar2026A – Runbook (Local/Deploy)

Stand: 2026-01-09

---

## Local Setup (Windows/Git Bash)

Voraussetzungen:
- Node LTS
- PostgreSQL lokal oder Cloud Dev DB
- `.env.local` (nicht committen)
- Prisma Migrations angewendet

Start:
- `npm install`
- `npm run dev`

---

## Scripts (Baseline)

- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm run db:seed`

---

## Environment Variables

### Required (Local Dev)
- `DATABASE_URL` – Postgres connection
- `AUTH_SESSION_SECRET` – Session/Auth Secret (>= 32 chars)
- `MOBILE_API_KEY_SECRET` – HMAC Secret für ApiKey Hashing (>= 32 bytes empfohlen)

### Recommended (TP 3.0 Provisioning)
- `MOBILE_PROVISION_TOKEN_SECRET` – HMAC Secret für Provision Token Hashing (>= 32 bytes empfohlen)

### Optional / Dev Convenience
- `NEXT_PUBLIC_DEFAULT_TENANT_SLUG`
- `NEXT_PUBLIC_DEV_USER_ID`

Seed (optional):
- `SEED_TENANT_SLUG`
- `SEED_TENANT_NAME`
- `SEED_OWNER_EMAIL`
- `SEED_OWNER_PASSWORD`

WICHTIG:
- `.env.example` enthält niemals echte Secrets.
- `.env.local` bleibt lokal und wird nicht committed.

---

## Secrets Handling (WICHTIG)

- Echte Secrets niemals im Repo.
- Ablage im Passwortmanager oder Hosting Environment.
- Optional: `docs/LeadRadar2026A/_private/SECRETS_PRIVATE.md` (gitignored)

Rotation/Incident:
- Wenn ein Secret/ApiKey publik wurde: rotieren (neues Secret setzen / Keys neu erstellen).

---

## Prisma / DB

### Migrations
- Local: `npx prisma migrate dev`
- Deploy: `npx prisma migrate deploy`

### Seed
- `npm run db:seed` (Alias für `prisma db seed`)

Hinweis:
- Seed legt standardmäßig einen Demo-Tenant an (z.B. `tenant_demo`).
- Für Atlex (oder andere) kann via `SEED_TENANT_SLUG=atlex` etc. gesteuert werden (abhängig vom Seed-Skript).
- Mobile Seed erzeugt (DEV-only) einen Demo ApiKey + Device und loggt den Klartext-Token einmalig in die Konsole.

---

## Mobile ApiKey Auth (TP 2.5)

### Überblick
- Mobile Requests müssen `x-api-key: <token>` senden.
- ApiKeys werden in der DB nur als Hash gespeichert (HMAC-SHA256 + `MOBILE_API_KEY_SECRET`).
- Klartext Key wird nur einmalig beim Create angezeigt (Admin UI / Admin API).

### Key Rotation (operativ)
1) Neuen ApiKey erstellen (Admin: `/admin/settings/mobile`)
2) Mobile Client auf neuen Key umstellen
3) Alten Key revoken
4) Assignments prüfen/aktualisieren

### Device Form Assignment
- Mobile Endpoints liefern/akzeptieren nur Forms, die dem Device zugewiesen sind.
- Unassigned => 404 NOT_FOUND (leak-safe).

---

## Device Provisioning (TP 3.0)

Ziel: Device-Onboarding ohne Copy/Paste von ApiKeys.

### Ops Flow (Admin → Device)
1) Admin: `/admin/settings/mobile` → Section “Provisioning” → “Create token”
2) Token erscheint **einmalig** + QR (DEV)
3) Mobile/App: `POST /api/mobile/v1/provision/claim` mit Provision Token
4) Response liefert **neuen** Mobile ApiKey (einmalig) + Device + Assignments
5) Danach normale Mobile Calls mit `x-api-key` (Forms/Leads)

### DEV Convenience
- `/admin/demo/provision` (DEV-only)
  - `?token=...` wird übernommen
  - Claim schreibt `leadradar.devMobileApiKey` und redirect `/admin/demo/capture`

---

## Demo Capture (DEV-only)

Route: `/admin/demo/capture`

Key Handling:
- Demo Capture liest Key aus LocalStorage:
  - `leadradar.devMobileApiKey` (neu)
  - `lr_demo_capture_mobile_api_key` (legacy)
- Optional: `?key=<token>` in der URL:
  - übernimmt den Key (schreibt LocalStorage)
  - entfernt den QueryParam danach automatisch (URL cleanup)

Empfohlenes Ops-Flow:
- ApiKey in `/admin/settings/mobile` erzeugen → “Use for Demo Capture” klicken → Leads generieren.

---

## Rate Limiting (Phase 1 – best-effort)

- In-Memory Rate Limiter pro ApiKey.
- Limitation: bei Multi-Instance / Serverless nicht global konsistent.
- Upgrade: Redis/Upstash (Phase 2/3).

Fehler: `429 RATE_LIMITED` via jsonError inkl. `traceId`.

---

## Troubleshooting

### Trace IDs
Jede API Response enthält:
- Header: `x-trace-id`
- Body: `traceId`

### Leak-safe 404
404 kann bedeuten:
- Resource existiert nicht, oder
- Resource gehört zu anderem Tenant, oder
- Form ist nicht assigned (Mobile)
Das ist beabsichtigt.

### Häufige Checks
- `npm run typecheck` / `npm run lint` / `npm run build`
- `npm run db:seed`

### TP 3.0 – 500 "prisma.mobileProvisionToken is undefined"
Ursache:
- Prisma Client wurde noch ohne das Model generiert (alte @prisma/client artifacts / Dev Server Cache)

Fix:
```bash
# DEV Server stoppen (Ctrl+C)
npx prisma generate
npx prisma migrate dev -n "mobile_provision_tokens"
rm -rf .next
npm run dev