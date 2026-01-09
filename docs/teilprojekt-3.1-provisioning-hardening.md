# Teilprojekt 3.1 — Provisioning Hardening (Single-use + klare Errors + Rate Limit) — ONLINE-only (MVP)

Status: IN PROGRESS  
Datum: 2026-01-09  
Commit(s): _(pending)_

## Ziel

Provisioning Claim-Flow produktionstauglich härten:

- Single-use garantiert (race-safe)
- Ablauf/Revocation sauber
- Klare, aber nicht-leaky Fehlercodes (Mobile Claim)
- Best-effort Abuse Schutz (Rate Limit)
- Demo UX ruhig + Trace-ID sichtbar

## Umsetzung (Highlights)

### Error-Policy (Mobile Claim)

- 401 `INVALID_PROVISION_TOKEN` → token ungültig / nicht gefunden / bad input (keine Details)
- 409 `PROVISION_TOKEN_EXPIRED|_USED|_REVOKED` → token existiert, aber nicht claimbar (balanced policy)
- 429 `RATE_LIMITED` → best-effort Abuse Schutz (Phase 1 in-memory)

### Race-safe Single-use

- Atomare Claim-Sperre via `updateMany(... where status=ACTIVE AND usedAt=null AND expiresAt>now ...)`
- Nur genau 1 Request gewinnt; Verlierer bekommt 409 used/revoked/expired (oder 401 fallback)

### Expires Handling

- EXPIRED wird computed:
  - Admin list liefert `effectiveStatus="EXPIRED"` wenn `status=ACTIVE` und `expiresAt<=now`
  - Claim auf expired → 409 `PROVISION_TOKEN_EXPIRED`

### Rate Limit (Phase 1)

- 10/min pro IP
- 5/min pro tokenHash-prefix
- Upgrade-Pfad: Redis/KV (Runbook)

## Dateien/Änderungen

- NEW `src/lib/rateLimit.ts`
- NEW `src/lib/mobileProvisioning.ts`
- UPDATE `src/app/api/mobile/v1/provision/claim/route.ts`
- UPDATE `src/app/api/admin/v1/mobile/provision-tokens/route.ts`
- UPDATE `src/app/api/admin/v1/mobile/provision-tokens/[id]/revoke/route.ts`
- UPDATE `src/app/(admin)/admin/demo/provision/ProvisionClient.tsx`
- UPDATE `src/app/(admin)/admin/demo/provision/ProvisionDemoClient.tsx`
- NEW `docs/teilprojekt-3.1-provisioning-hardening.md`

## Akzeptanzkriterien – Check

- [ ] Parallel claim → genau 1 success, 1 fail (used)
- [ ] Expired token → fail reproduzierbar
- [ ] Revoked token → fail reproduzierbar
- [ ] Invalid token → 401
- [ ] Rate limit → 429 reproduzierbar
- [ ] Admin UI: Status darstellbar + revoke disabled (pending UI file)
- [ ] Demo page: ruhige Meldungen + traceId
- [ ] typecheck/lint/build grün; docs aktualisiert; push

## Tests/Proof (reproduzierbar)

```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build
npm run db:seed
npm run dev
Parallel claim:

bash
Code kopieren
TOKEN="prov_...."
curl -s -i -H "content-type: application/json" -d "{\"token\":\"$TOKEN\"}" http://localhost:3000/api/mobile/v1/provision/claim &
curl -s -i -H "content-type: application/json" -d "{\"token\":\"$TOKEN\"}" http://localhost:3000/api/mobile/v1/provision/claim &
wait
Rate limit:

bash
Code kopieren
for i in {1..20}; do
  curl -s -o /dev/null -w "%{http_code}\n" -H "content-type: application/json" -d "{\"token\":\"INVALID_INVALID_INVALID\"}" http://localhost:3000/api/mobile/v1/provision/claim
done
Offene Punkte / Risiken
P1: Admin Settings UI Provisioning-Liste braucht Anpassung (effectiveStatus + disable revoke)

P1: Runbook/Api Docs Updates fehlen noch (bitte Files liefern)

Next Step
Admin Settings UI file(s) liefern → Provisioning Tabelle + Buttons hardenen

docs/LeadRadar2026A/{03_API,04_RUNBOOK,04_ADMIN_UI}.md aktualisieren

Schlussrapport finalisieren + Commit/Push
