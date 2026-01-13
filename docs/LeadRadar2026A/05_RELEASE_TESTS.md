# LeadRadar2026A — Release Tests (Smoke/Regression)

## Smoke (immer)
1) `npm run typecheck` → 0 Errors  
2) `npm run lint` → 0 Errors  
3) `npm run build` → grün  

## Runtime Smoke (lokal)
Start:
- `npm run dev`

Health:
- `curl -i http://localhost:3000/api/platform/v1/health`
- `curl -i http://localhost:3000/api/admin/v1/health`
- `curl -i http://localhost:3000/api/mobile/v1/health`

Erwartungen:
- Status 200
- Header `x-trace-id` gesetzt
- Body `ok:true` + `traceId`

## Auth + Ops Smoke (DEV)
- `npm run auth:smoke`
  - prüft DEV Logins (Atlex + Demo)
- `npm run events:smoke`
  - erzeugt 2 Events pro Tenant
  - ACTIVE Guardrail: Aktivieren archiviert vorheriges ACTIVE Event
  - Device Binding Guard: bindet ein Device ans ACTIVE Event
  - Auto-Unbind: ARCHIVE unbindet Devices (Count > 0)
