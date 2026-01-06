# Teilprojekt 2.4: Lead Capture End-to-End (Mobile API v1 + Demo Capture Client)

Status: IN REVIEW (nach lokalem Proof → DONE)

Datum: 2026-01-06

## Ziel

- Mobile API v1 bereitstellen:
  - GET /api/mobile/v1/forms (ACTIVE only)
  - GET /api/mobile/v1/forms/:id (fields sortiert)
  - POST /api/mobile/v1/leads (idempotent via clientLeadId)
- Interner Demo Capture Screen:
  - /admin/demo/capture (auth protected via Admin-Shell)
  - Form auswählen → Inputs aus fields rendern → Lead submit → Success
- Proof:
  - mind. 3 Leads erzeugen
  - sichtbar in /admin/leads
  - CSV Export enthält values_json

## Umsetzung (Highlights)

- Mobile v1 Routes strikt tenant-scoped (requireTenantContext), leak-safe 404 bei mismatch.
- Lead create ist idempotent über Unique (tenantId, clientLeadId):
  - create → deduped:false
  - duplicate → fetch existing → deduped:true
- Demo Capture rendert MVP FieldTypes:
  - TEXT / EMAIL / PHONE / TEXTAREA (fallback: TEXT)

## Dateien/Änderungen

- src/app/api/mobile/v1/forms/route.ts
- src/app/api/mobile/v1/forms/[id]/route.ts
- src/app/api/mobile/v1/leads/route.ts
- src/app/(admin)/admin/demo/capture/page.tsx
- src/app/(admin)/admin/demo/capture/CaptureClient.tsx
- docs/LeadRadar2026A/03_API.md
- docs/teilprojekt-2.4-lead-capture-e2e.md

## Akzeptanzkriterien – Check

- [ ] GET forms liefert ACTIVE
- [ ] GET form detail liefert fields sortiert
- [ ] POST lead idempotent (duplicate → deduped:true)
- [ ] Demo Capture erzeugt echte Leads
- [ ] /admin/leads zeigt sie
- [ ] Export CSV enthält values_json
- [ ] npm run typecheck → 0 errors
- [ ] npm run lint → 0 errors (warnings ok)
- [ ] npm run build → grün
- [ ] git status clean, commit(s) gepusht

## Tests/Proof (reproduzierbar)

### Curl (Beispiel)
Hinweis: Headers je nach Dev/Auth Setup (Proxy/Tenant Context). Minimal braucht es Tenant-Kontext.

1) List forms
curl -sS -H "x-tenant-id: <TENANT_ID>" -H "x-user-id: <USER_ID>" http://localhost:3000/api/mobile/v1/forms | jq

2) Form detail
curl -sS -H "x-tenant-id: <TENANT_ID>" -H "x-user-id: <USER_ID>" http://localhost:3000/api/mobile/v1/forms/<FORM_ID> | jq

3) Lead create (idempotent)
curl -sS -X POST \
  -H "content-type: application/json" \
  -H "x-tenant-id: <TENANT_ID>" \
  -H "x-user-id: <USER_ID>" \
  -d '{"formId":"<FORM_ID>","clientLeadId":"demo-001","capturedAt":"2026-01-06T12:34:56.000Z","values":{"firstName":"Max","email":"max@example.com"},"meta":{"source":"curl"}}' \
  http://localhost:3000/api/mobile/v1/leads | jq

(nochmals senden → deduped:true)

### UI
- /admin/demo/capture öffnen
- ACTIVE Form auswählen
- 3 Leads erfassen
- Check: /admin/leads
- Export: /admin/exports → CSV erzeugen → values_json enthält die values

## Offene Punkte / Risiken

- P1: Mobile Auth/Activation Gate ist noch nicht Teil dieses TP (Phase 1 Demo-only).
- P1: FieldType Mapping nur MVP (TEXT/EMAIL/PHONE/TEXTAREA).

## Next Step

- Proof lokal durchführen und dann Schlussrapport auf DONE setzen + Commit/Push.
