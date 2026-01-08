# Teilprojekt 2.9 — Admin Mobile Ops (ApiKeys/Devices/Assignments) + Demo-Capture Key UX (MVP)

Status: DONE ✅  
Datum: 2026-01-08 (Europe/Zurich)

## Ziel
Mobile Operations im Admin produktfähig machen:
- ApiKeys verwalten (list/create/one-time token/revoke)
- Devices verwalten (list/detail/rename/enable-disable)
- Assignments Device↔Forms pflegen (Replace Strategy)
- Demo Capture DEV-UX: Key bequem übernehmen (localStorage + ?key=)

## Umsetzung (Highlights)
- Admin API `/api/admin/v1/mobile/*` ergänzt:
  - Keys: list/create/revoke
  - Devices: list/detail/patch
  - Assignments: PUT replace
  - Forms list für Assignments (ACTIVE default, optional ALL)
- Mobile Forms list (`/api/mobile/v1/forms`) aktualisiert `lastUsedAt` (ApiKey) und `lastSeenAt` (Device).
- Admin UI Screen: `/admin/settings/mobile`
  - Section ApiKeys: Table + Create Modal + One-time Token Dialog + Revoke
  - Section Devices: Table + Drawer (Rename/Status + Assignments Editor + Save replace)
- Demo Capture DEV UX:
  - unified localStorage key: `leadradar.devMobileApiKey`
  - DEV-only: `?key=...` übernimmt Key, speichert, und reinigt URL
  - Hinweis/Quicklink wenn Key fehlt

## API (Admin) — Contracts (MVP)
### GET /api/admin/v1/mobile/keys
Response: `{ items: ApiKeyDto[] }`

### POST /api/admin/v1/mobile/keys
Body: `{ label?: string; createDevice?: boolean; deviceName?: string }`  
Response: `{ apiKey: ApiKeyDto; token: string }` (token nur 1x)

### POST /api/admin/v1/mobile/keys/:id/revoke
Response: `{ apiKey }`

### GET /api/admin/v1/mobile/devices
Response: `{ items: DeviceRow[] }`

### GET /api/admin/v1/mobile/devices/:id
Response: `{ device, assignedForms[] }`

### PATCH /api/admin/v1/mobile/devices/:id
Body: `{ name?: string; status?: "ACTIVE"|"DISABLED" }`

### PUT /api/admin/v1/mobile/devices/:id/assignments
Body: `{ formIds: string[] }`  
Replace-Strategy (deleteMany + createMany)

### GET /api/admin/v1/mobile/forms?status=ACTIVE|ALL|...
Response: `{ items: [{id,name,status,createdAt}] }`

## DEV Key Handling
- Mobile Ops Create Key speichert Token in LocalStorage: `leadradar.devMobileApiKey`
- Demo Capture liest ebenfalls aus `leadradar.devMobileApiKey`
- DEV-only: `/admin/demo/capture?key=<token>` setzt Storage + entfernt Param aus URL

## Tests / Proof (reproduzierbar)
1) Quality Gates
```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build

