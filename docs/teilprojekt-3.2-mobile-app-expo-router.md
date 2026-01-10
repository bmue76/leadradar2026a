# Teilprojekt 3.2 — Mobile App (Expo Router) — Provisioning + Forms + Lead Capture (ONLINE-only, MVP)

Status: DONE ✅  
Datum: 2026-01-10

## Ziel
Erste produktfähige Mobile App (MVP):
- Provisioning via QR/Token → Claim → x-api-key sicher speichern
- Assigned Forms laden
- Leads erfassen und senden (E2E sichtbar in /admin/leads)
- Phase 1: ONLINE-only, Offline nur architektonisch vorbereitet (kein Sync)

## Umsetzung (Highlights)
- Expo + TypeScript + Expo Router unter `apps/mobile`.
- SecureStore Speicherung für `x-api-key` (Device Session).
- `/provision`: QR-Scan oder Token Paste (raw `prov_...` oder URL `?token=...`) → POST `/api/mobile/v1/provision/claim`.
- `/forms`: GET `/api/mobile/v1/forms` (x-api-key) → assigned ACTIVE forms.
- `/forms/[id]`: GET `/api/mobile/v1/forms/:id` → render MVP FieldTypes, minimale Validierung, POST `/api/mobile/v1/leads` mit `clientLeadId`.
- 401-Handling: “Gerät nicht autorisiert” → reset key → neu aktivieren.
- Offline vorbereitet (nur Interfaces/Placeholders): `PendingLead`, `enqueueLead`, `flushQueue`.

## Relevante Dateien
- `apps/mobile/app/index.tsx` (Boot redirect)
- `apps/mobile/app/provision.tsx`
- `apps/mobile/app/forms/index.tsx`
- `apps/mobile/app/forms/[id].tsx`
- `apps/mobile/app/settings.tsx`
- `apps/mobile/src/lib/api.ts`, `auth.ts`, `env.ts`, `uuid.ts`, `offline.ts`
- `apps/mobile/.env.example`, `apps/mobile/README.md`

## Dev Connectivity (Android Phone)
- `.env.local` (nicht committen):
  - `EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:3000`
- Phone und Laptop im gleichen WLAN.
- Falls LAN/HTTP Probleme: DEV-only Tunnel als Workaround möglich.

## Proof / Smoke (E2E)
Backend:
- `npm run db:seed`
- `npm run dev`

Admin:
- `/admin/settings/mobile` → Provision Token (QR/Copy)
- `/admin/leads` → Lead sichtbar

Mobile:
- `/provision` → Claim → `/forms` → Form öffnen → Lead senden → OK

Optional:
- `curl -i -H "x-api-key: <KEY>" http://localhost:3000/api/mobile/v1/forms` → 200

