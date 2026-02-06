# Schlussrapport — Teilprojekt 6.9: Mobile Ops → Device Slot Limit (Guard + UX)

Status: DONE ✅  
Datum: 2026-02-06  
Branch: main  
Commit(s):
- c11aa6d — fix(tp6.9): next route params typing for device deactivate
- 8c69acd — fix(tp6.9): enforce device slot limit on mobile provision token create
- ae5ddc8 — fix(tp6.9): provision token limit ux + devices cta

## Ziel

- Keine Provision Tokens erstellen, wenn Device-Slots voll sind.
- Klarer UX-Hinweis in Mobile Ops: (X/Y) + CTA „Zu Geräten“.

## Umsetzung

### API
- Endpoint: `POST /api/admin/v1/mobile/provision-tokens`
- Guard: Wenn `activeDevices >= maxDevices` → `402 DEVICE_LIMIT_REACHED`
- Details Payload: `{ activeDevices, maxDevices }`

### Admin UI
- Screen: `/admin/settings/mobile` (Mobile Ops)
- Verhalten bei `DEVICE_LIMIT_REACHED`:
  - Banner: „Maximale Anzahl Geräte erreicht (X/Y)“
  - CTA „Zu Geräten“ → `/admin/devices`

## Smoke Tests (reproduzierbar)

1) Limit voll → Token erstellen → Banner erscheint + Link zu `/admin/devices`  
2) Gerät deaktivieren → Slot frei → Token erstellen klappt  
3) Quality Gates:
```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build
Non-Goals
Kein UX-Polish am gesamten Mobile Ops Screen, nur limit-bezogene Klarheit.

Keine Migration der alten /api/admin/v1/devices/provision-tokens UI (nicht verwendet).

Next Step
TP 6.10: Devices — Admin Device-Management + Slots/Limit UX (Actions: Deaktivieren/Revoken, Slot-Übersicht X/Y, klare Empty/Limit States).
