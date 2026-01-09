# Teilprojekt 3.0 — Device Provisioning via One-Time Tokens + Demo QR (MVP)

Status: DONE ✅  
Datum: 2026-01-09  
Commit(s):
- d75aea2 — feat(mobile): device provisioning via one-time tokens + demo qr (tp 3.0)

---

## Ziel

Mobile Onboarding produktfähig vereinfachen:

- One-time Provision Token erstellen (Admin) → als QR/Copy weitergeben
- Mobile Device kann Token claimen → erzeugt Device + ApiKey + optionale Assignments
- Admin kann Tokens listen / revoke (Ops)
- Demo UX für schnelles E2E-Testing (DEV): `/admin/demo/provision?token=...`

---

## Problem / Incident (ausgelöst in TP 3.0)

**Symptom:** `/admin/settings/mobile` erzeugt beim Create Token HTTP 500  
**Fehler:** `TypeError: Cannot read properties of undefined (reading 'create')` bei `prisma.mobileProvisionToken.create(...)`

### Root Cause (praktisch)

Prisma Client / Next Server war stale (Model existiert im Schema/Migration, aber der laufende Prozess hatte Client/Runtime noch nicht sauber „gesehen“).

### Fix / Verifikation

- Prisma Client geprüft: `scripts/check-provision-client.js` → `has mobileProvisionToken: true`
- Endpoint direkt geprüft: `curl POST /api/admin/v1/mobile/provision-tokens` → 200 OK + Token returned
- Danach war das Admin-UI wieder stabil.

---

## Umsetzung (Highlights)

### A) DB / Prisma

Neues Modell + Status Enum:

- `MobileProvisionToken` inkl. `status` default `ACTIVE`
- Relation Device ↔ used tokens (`MobileDevice.provisionTokensUsed` Relation)

Migration hinzugefügt:

- `prisma/migrations/20260109123620_mobile_provision_tokens/migration.sql`

### B) Admin API (tenant-scoped)

- `POST /api/admin/v1/mobile/provision-tokens`
  - erzeugt Provision Token (one-time Klartext returned)
  - optional: `deviceName`, `expiresInMinutes`, `formIds`

- `GET /api/admin/v1/mobile/provision-tokens?limit=...`
  - listet Tokens für Ops

- `POST /api/admin/v1/mobile/provision-tokens/:id/revoke`
  - revoke nur wenn `ACTIVE`

### C) Mobile API (claim)

- `POST /api/mobile/v1/provision/claim`
  - nimmt one-time Token entgegen
  - erstellt: ApiKey + Device
  - optional: initial Assignments (replace/initial)

### D) Admin UI (Mobile Ops)

`/admin/settings/mobile` → neue Section **Provisioning**

- Create Modal:
  - token one-time anzeigen + Copy
  - QR optional (DEV) → Link zu `/admin/demo/provision?token=...`
- List + Revoke Token

### E) Demo UI (DEV)

`/admin/demo/provision`

- Token via Query Param
- “Claim”-Flow zum schnellen End-to-End Proof

### F) QR / Typing Hardening

- `src/lib/qrcode.ts` + `src/types/qrcode.d.ts`
- löst TS/Build-Probleme rund um qrcode Import
- reduziert any/eslint noise

---

## Proof / Nachweis

### 1) Prisma Client enthält Model

`scripts/check-provision-client.js` Output:

- `has mobileProvisionToken: true`
- `client props (provision): [ 'mobileProvisionToken' ]`

### 2) Admin Endpoint liefert Token (curl)

Beispiel (lokal):

`POST /api/admin/v1/mobile/provision-tokens` → `200 OK`

Response enthält:

- `data.provision` (meta)
- `data.token` (klartext one-time token)

---

## Geänderte / neue Files (Auszug)

### DB
- `prisma/schema.prisma`
- `prisma/migrations/20260109123620_mobile_provision_tokens/migration.sql`

### Admin UI
- `src/app/(admin)/admin/settings/mobile/MobileOpsClient.tsx`
- `src/app/(admin)/admin/demo/provision/page.tsx`
- `src/app/(admin)/admin/demo/provision/ProvisionClient.tsx`
- `src/app/(admin)/admin/demo/provision/ProvisionDemoClient.tsx`

### API
- `src/app/api/admin/v1/mobile/provision-tokens/route.ts`
- `src/app/api/admin/v1/mobile/provision-tokens/[id]/revoke/route.ts`
- `src/app/api/mobile/v1/provision/claim/route.ts`

### Libs/Types
- `src/lib/mobileProvisioning.ts`
- `src/lib/qrcode.ts`
- `src/types/qrcode.d.ts`

### Docs (updated)
- `docs/LeadRadar2026A/02_DB.md`
- `docs/LeadRadar2026A/03_API.md`
- `docs/LeadRadar2026A/04_RUNBOOK.md`
- `docs/LeadRadar2026A/04_ADMIN_UI.md`
- `docs/teilprojekt-2.9-mobile-ops-admin.md` (Ergänzung)
- `docs/teilprojekt-3.0-device-provisioning-qr.md` (dieser Rapport)

---

## Ops / Troubleshooting Notes

Wenn nochmals ein „Model undefined“ im Running Server auftaucht (typisch nach neuen Migrationen):

- `npx prisma generate` (oder `npm run typecheck/prebuild` triggert das)
- Dev Server neu starten
- Sicherstellen, dass Migration angewendet ist (`migrate dev` / `deploy`)

---

## Cleanup (offen)

Untracked Migration:

- `prisma/migrations/20260109124940_tp_3_0_mobile_provision_tokens/`

Wenn veraltet/duplicated: löschen (kein Commit nötig, wenn danach clean):

```bash
rm -rf "prisma/migrations/20260109124940_tp_3_0_mobile_provision_tokens"
git status

