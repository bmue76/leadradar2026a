# 05_RELEASE_TESTS — GoLive Readiness Pack (TP 4.0)

Stand: ONLINE-only (MVP)

Dieses Dokument beschreibt reproduzierbare Checks für Release/GoLive:
- Static Checks (typecheck, lint, build)
- Smoke Suite (auth/events/mobile/exports)
- Minimal Assertions (ok/traceId, CSV Download Shape)

> Keine Secrets in Git. Lokale/staging Werte in `.env.local` bzw. Hosting-ENV setzen.

---

## A) Standard Release Checks (Pflicht)

### 1) Static Checks
```bash
npm run typecheck
npm run lint
npm run build
Erwartung:

typecheck: 0 Errors

lint: 0 Errors (Warnings ok)

build: grün

2) Smoke Suite (Pflicht)
Gesamtlauf:

bash
Code kopieren
npm run smoke:all
Reihenfolge:

auth:smoke

events:smoke

mobile:smoke

exports:smoke

Erwartung:

alle Smokes enden mit PASSED

exit code 0

Wenn rot:

traceId ausgeben lassen und in Logs korrelieren

B) Einzel-Smokes (Details)
1) Auth Smoke
Script: scripts/auth-smoke.mjs

Run:

bash
Code kopieren
npm run auth:smoke
Target:

AUTH_SMOKE_BASE_URL (default http://localhost:3000)

Hinweis:

Nutzt DEV-Logins (nur DEV; in Staging/Prod muss das via echte Smoke-Accounts gelöst werden).

Typische Fehler:

401/403: falsche Credentials / Debug-Auth deaktiviert

ok=false: Standard-Error (traceId im Body/Header)

2) Events Guardrails Smoke
Script: scripts/events-guardrails-smoke.mjs

Run:

bash
Code kopieren
npm run events:smoke
Validiert (tenant-scoped via Session Cookie):

ACTIVE Invariants: nur 1 ACTIVE

Device Binding an ACTIVE Event möglich

Beim Archivieren ACTIVE: Auto-Unbind count > 0

Prereq:

pro Tenant existiert mind. 1 Device (über Mobile Ops provisioned)

3) Mobile Smoke
Script: tools/smoke/mobile-smoke.mjs

Run:

bash
Code kopieren
npm run mobile:smoke
Flow (MVP):

DEV Login (Session Cookie)

Provision Token ausstellen (Admin API) oder via ENV-Fallback

Claim -> x-api-key

Mobile Forms List (GET /api/mobile/v1/forms)

Lead Create (POST /api/mobile/v1/leads)

Optional: Attachment Upload (best-effort / optional)

Defaults:

MOBILE_SMOKE_BASE_URL=http://localhost:3000

Tenants: Atlex + Demo (gemäss Script)

Optionale ENV Overrides:

MOBILE_SMOKE_TENANT_SLUG_ATLEX="atlex"

MOBILE_SMOKE_TENANT_SLUG_DEMO="demo"

MOBILE_SMOKE_CLAIM_PATH="/api/mobile/v1/provision/claim"

Fallbacks (wenn automatische Token-Ausstellung nicht verfügbar):

MOBILE_SMOKE_PROVISION_TOKEN="..." (Claim wird ausgeführt)

MOBILE_SMOKE_API_KEY="..." (Claim wird übersprungen)

Optional Attachment:

MOBILE_SMOKE_WITH_ATTACHMENT=1 (warn-only, falls Upload-Route fehlt)

MOBILE_SMOKE_ATTACHMENT_REQUIRED=1 (macht Upload-Fehler blocking)

Typische Fehler:

forms leer: Tenant hat kein (ACTIVE) Form / Assignment fehlt / Device nicht korrekt gebunden

missing apiKey: Claim/Provisioning Endpoints weichen ab -> ENV-Fallback nutzen

Lead Create 404: Assignment/tenant mismatch -> leak-safe

4) Exports Smoke
Script: tools/smoke/exports-smoke.mjs

Run:

bash
Code kopieren
npm run exports:smoke
Flow (gemäss implementierten Admin Routes):

DEV Login (Session Cookie)

Export Job erstellen: POST /api/admin/v1/exports/csv

Polling: GET /api/admin/v1/exports/:id bis DONE

Download: GET /api/admin/v1/exports/:id/download

Minimal-Assertions: nicht leer, nicht HTML, enthält Newline

Defaults:

EXPORTS_SMOKE_BASE_URL=http://localhost:3000

Artefakte:

speichert Download als downloaded-*.csv (gitignored)

Typische Fehler:

Timeout: Job bleibt RUNNING -> Worker/Processing prüfen, .tmp_exports Rechte

Download HTML: Auth/Session fehlt oder falscher Endpoint

C) Staging / Prod Hinweise (MVP)
DEV Debug-Auth (x-debug-auth) darf in Staging/Prod nicht aktiv sein.

Smokes in Staging/Prod brauchen dedizierte Smoke-Accounts.

Mobile Smokes in Prod: Provision Token Issuance muss sicher/limitiert erfolgen (oder Token manuell bereitstellen).

D) Minimal GoLive Checklist (Kurz)
Vor GoLive (Staging):

npm run typecheck && npm run lint && npm run build

npm run smoke:all (gegen Staging-URL)

TraceId/Logs-Access verfügbar

Tenant-scope leak-safe geprüft (mismatch -> 404)

Nach Deploy:

smoke:all gegen Prod (nur wenn Smoke-Accounts + Policies sauber)

## TP 7.8 — GoLive Smoke: Lizenzkauf + Device Onboarding

1) **Stripe listen** starten (lokal):
   - `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
   - `STRIPE_WEBHOOK_SECRET=whsec_...` setzen
   - Dev-Server neu starten

2) **Admin → Geräte**
   - Gerät hinzufügen, Name setzen
   - „Lizenz“ → 30D/365D kaufen → nach Checkout:
     - Status zeigt **Aktiv** oder **Gekauft · wartet auf Aktivierung**

3) **Admin → Gerät einrichten**
   - Token erzeugen, per Mail senden (kommt an)
   - Redeem (API) liefert ApiKey
   - `/api/mobile/v1/license` liefert korrekt `{isActive, endsAt, type}`
