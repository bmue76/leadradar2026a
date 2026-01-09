# Teilprojekt 3.0 — Device Provisioning (QR / Provision Token) + App-Onboarding Flow (ONLINE-only, MVP)

Status: IMPLEMENTED (Code) ✅ — Docs-Integration in LeadRadar2026A/* pending (needs existing files)

Datum: 2026-01-09

## Ziel

Device-Onboarding ohne manuelles Copy/Paste von ApiKeys:

- Admin erzeugt Provisioning-Token (1x Klartext) inkl. optional DeviceName + initial Assignments (ACTIVE formIds)
- Mobile/App claimt Token → erhält x-api-key (nur 1x) + Device + Assignments
- Danach funktioniert Mobile Capture sofort (GET forms + POST leads)

## Umsetzung (Highlights)

### A) DB / Prisma
- Neues Model `MobileProvisionToken` tenant-scoped:
  - `tokenHash` (unique), `prefix` (für Liste), `status` (ACTIVE/REVOKED/USED)
  - `expiresAt`, `usedAt`, `usedByDeviceId`
  - optional `requestedDeviceName`, `requestedFormIds` (Json string[])
- Klartext-Token wird nie gespeichert.

### B) Admin API (tenant-scoped, leak-safe)
- `POST /api/admin/v1/mobile/provision-tokens`
  - Body: `{ deviceName?, formIds?, expiresInMinutes? }`
  - Response: `{ provision: {...}, token: "<PLAINTEXT_ONE_TIME>" }`
- `GET /api/admin/v1/mobile/provision-tokens`
  - Response: `{ items: [...], nextCursor? }`
- `POST /api/admin/v1/mobile/provision-tokens/:id/revoke`
  - Leak-safe: falscher tenant/id -> 404

### C) Mobile API (no x-api-key, auth only via Provision Token)
- `POST /api/mobile/v1/provision/claim`
  - invalid/expired/used/revoked -> 401 `INVALID_PROVISION_TOKEN` (keine Details)
  - success -> erstellt Device + ApiKey + Assignments, markiert Token USED
  - Response: `{ device, apiKey, token: "<MOBILE_API_KEY_ONE_TIME>", assignedFormIds }`

### D) Admin UI
- `/admin/settings/mobile` → neue Section "Provisioning"
  - Create token modal (deviceName, expires, assignments)
  - One-time token + Copy + QR (SVG, ohne externe Services)
  - List + revoke

### E) DEV Proof UI
- `/admin/demo/provision` (DEV-only):
  - Token input (oder via `?token=...`)
  - Claim call → speichert `leadradar.devMobileApiKey` → redirect `/admin/demo/capture`

## Dateien / Änderungen

- `prisma/schema.prisma` (MobileProvisionToken + enum + relations)
- `src/lib/mobileProvisioning.ts` (token/key generation + hashing)
- `src/lib/qrcode.ts` (QR SVG data-url generator)
- `src/app/api/admin/v1/mobile/provision-tokens/route.ts`
- `src/app/api/admin/v1/mobile/provision-tokens/[id]/revoke/route.ts`
- `src/app/api/mobile/v1/provision/claim/route.ts`
- `src/app/(admin)/admin/settings/mobile/MobileOpsClient.tsx` (Provisioning UI)
- `src/app/(admin)/admin/demo/provision/page.tsx`
- `src/app/(admin)/admin/demo/provision/ProvisionDemoClient.tsx`

## Akzeptanzkriterien – Check

- [x] Admin kann Provision Token erstellen (Token 1x) + QR/Copy
- [x] Admin kann Token revoke (danach claim 401)
- [x] Claim erstellt Device + ApiKey + Assignments (wenn gewählt)
- [x] Demo provision → speichert x-api-key → Demo capture kann danach arbeiten
- [x] Invalid/expired/used token → 401 INVALID_PROVISION_TOKEN (keine Leaks)
- [ ] Global docs updated (needs current docs/LeadRadar2026A/* files to replace fully)

## Tests / Proof (reproduzierbar)

```bash
cd /d/dev/leadradar2026a

# Migration
npx prisma migrate dev -n "mobile_provision_tokens"

# (optional) seed
npm run db:seed

npm run typecheck
npm run lint
npm run build

