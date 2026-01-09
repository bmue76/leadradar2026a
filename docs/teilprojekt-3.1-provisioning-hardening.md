# Teilprojekt 3.1 — Provisioning Hardening (Single-use + klare Errors + Rate Limit) — ONLINE-only (MVP)

Datum: 2026-01-09  
Status: DONE ✅

## Ziel

Den Provisioning Claim-Flow aus TP 3.0 produktionstauglich härten:

- Single-use garantiert (race-safe), auch bei parallelen Requests
- Expiry/Revocation sauber in Admin + API sichtbar
- Fehler-Taxonomie klar, aber leak-safe (Mobile Claim)
- Best-effort Abuse Schutz via Rate Limit (Phase 1 in-memory), mit Upgrade-Pfad
- UX minimal angepasst (Admin Status + disabled actions, Demo ruhig + traceId)

## DB/Schema Check (DoD)

- `MobileProvisionToken.tokenHash` ist `@unique` ✅
- Felder vorhanden: `status`, `expiresAt`, `usedAt?`, `usedByDeviceId?` ✅
- Kein Schema/Migration nötig (EXPIRED ist computed in API/UI) ✅

## Entscheidung: Error Policy (Mobile Claim)

**Strict, leak-safe:**
- invalid / expired / revoked / used => `401 INVALID_PROVISION_TOKEN`
- rate-limited => `429 RATE_LIMITED`

Begründung:
- Token ist “shared secret” ohne Tenant-Context; keine Details/Existenz preisgeben.
- Admin Endpoints dürfen konkret sein (NOT_FOUND leak-safe, INVALID_STATE etc.).

## Umsetzung

### A) Single-use Enforcement (race-safe)
- Claim macht ein `updateMany` mit Guard:
  - `status=ACTIVE AND usedAt IS NULL AND expiresAt > now`
- Genau eine Anfrage kann `count === 1` erreichen → Winner
- Rest erhält 401 `INVALID_PROVISION_TOKEN`
- Device + ApiKey + Assignments werden im selben Prisma-Transaction Scope erstellt
- Audit: `usedByDeviceId` wird im gleichen Tx gesetzt

### B) Expires Handling
- Admin List gibt `status=EXPIRED` computed zurück, wenn:
  - DB-status ist `ACTIVE` und `expiresAt <= now`
- UI zeigt EXPIRED Chip + revoke disabled

### C) Revoke Handling
- Admin revoke erlaubt nur bei effektiv `ACTIVE` (nicht expired)
- Sonst: `409 INVALID_STATE` (Admin-only klar)

### D) Abuse Protection (best-effort)
- Provision Claim Rate Limiting via `src/lib/rateLimit.ts` (in-memory, Phase 1):
  - pro IP (key: `prov_claim:ip:<ip>`)
  - pro tokenHash-prefix (key: `prov_claim:tok:<prefix>`)
- Upgrade-Pfad Redis/Upstash im Runbook dokumentiert

### E) UX/Docs
- Admin UI: Provisioning Table zeigt Status (inkl. EXPIRED) + UsedByDeviceId (kurz) + disabled revoke
- Demo Provision Page: ruhige Fehlermeldung + traceId, ohne technische Details

## Geänderte / neue Files

API:
- `src/app/api/mobile/v1/provision/claim/route.ts`
- `src/app/api/admin/v1/mobile/provision-tokens/route.ts`
- `src/app/api/admin/v1/mobile/provision-tokens/[id]/revoke/route.ts`

Admin/Demo UI:
- `src/app/(admin)/admin/settings/mobile/MobileOpsClient.tsx`
- `src/app/(admin)/admin/demo/provision/ProvisionClient.tsx`

Docs:
- `docs/LeadRadar2026A/03_API.md`
- `docs/LeadRadar2026A/04_RUNBOOK.md`
- `docs/LeadRadar2026A/04_ADMIN_UI.md`
- `docs/teilprojekt-3.1-provisioning-hardening.md` (neu)

## Tests / Proof (reproduzierbar)

```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build
npm run db:seed
npm run dev
1) Create token (Admin UI)
/admin/settings/mobile → Provisioning → Create token → Copy token

2) Claim success
/admin/demo/provision?token=... → Claim token → redirect /admin/demo/capture

Erwartung: Device + ApiKey erstellt; Provision Token wird USED + usedAt + usedByDeviceId

3) Parallel claim (race)
bash
Code kopieren
TOKEN="prov_..."
curl -s -i -H "content-type: application/json" -d "{\"token\":\"$TOKEN\"}" http://localhost:3000/api/mobile/v1/provision/claim &
curl -s -i -H "content-type: application/json" -d "{\"token\":\"$TOKEN\"}" http://localhost:3000/api/mobile/v1/provision/claim &
wait
Erwartung:

genau 1x 200 OK

1x 401 INVALID_PROVISION_TOKEN

4) Rate limit
bash
Code kopieren
for i in {1..20}; do
  curl -s -o /dev/null -w "%{http_code}\n" -H "content-type: application/json" -d "{\"token\":\"INVALID\"}" http://localhost:3000/api/mobile/v1/provision/claim
done
Erwartung:

mehrere 401

ab Threshold 429 RATE_LIMITED

5) Revoke invalid state
Token USED/EXPIRED/REVOKED → Revoke Button disabled (UI)

Direkt API call (Admin) auf nicht-ACTIVE → 409 INVALID_STATE

Ergebnis
Provisioning Claim ist nun:

single-use & race-safe

leak-safe im Mobile Claim

mit best-effort Abuse Schutz

operational sichtbar (EXPIRED computed, revoke state enforced)

dokumentiert (API + Runbook + Admin UI)

Nächste Schritte (TP 3.2 Vorschlag)
Mobile App Integration: Provisioning Onboarding Screen + QR Scan

Shared Rate Limit Store (Redis/Upstash) für Multi-Instance

Optional: Telemetrie/Logging (audit events: token created/claimed/revoked)
