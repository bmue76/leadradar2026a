# Teilprojekt 4.0 — GoLive Readiness Pack (Release Tests + Smoke Suite + Runbook Hardening) — ONLINE-only (MVP)

Status: DONE ✅  
Datum: 2026-01-15

## Ziel
GoLive-/Betriebsreife erhöhen durch reproduzierbare Smoke/Release Checks + Runbook-Härtung, ohne neue Produktfeatures.

## Scope / Constraints
- ONLINE-only (kein Offline)
- Tenant-scope leak-safe (mismatch -> 404)
- Standard Responses & traceId Pattern nicht brechen
- Keine Secrets in Git; `.env.local` nur lokal

---

## Deliverables

### 1) Smoke Scripts (neu/gehärtet)
- `npm run mobile:smoke`
  - Provision Claim → `x-api-key`
  - Forms List
  - Lead Create
  - Optional Attachment Upload (konfigurierbar)
- `npm run exports:smoke`
  - Create Export Job → Poll bis DONE → Download → Minimal Assertions
  - Nutzt reale Admin Routes:
    - `POST /api/admin/v1/exports/csv`
    - `GET /api/admin/v1/exports/:id`
    - `GET /api/admin/v1/exports/:id/download`
- `npm run smoke:all`
  - Runner für: `auth:smoke` → `events:smoke` → `mobile:smoke` → `exports:smoke`
  - Windows/Git Bash robust: verwendet `cmd.exe /c "npm run <script>"` (fix für spawn EINVAL)

### 2) Docs Update (Hardening)
- `docs/LeadRadar2026A/05_RELEASE_TESTS.md`
  - Pflicht-Checks + Smoke Suite + Einzel-Smokes + Minimal Assertions
  - Staging/Prod Hinweise + Minimal GoLive Checklist
- `docs/LeadRadar2026A/04_RUNBOOK.md`
  - Setup / Reset / Troubleshooting gehärtet
  - TraceId Workflow, Windows spawn EINVAL, typische Smoke Fehlerbilder

---

## Proof (DEV)
Ausgeführt (grün):
- `npm run typecheck` ✅
- `npm run lint` ✅ (Warnings ok)
- `npm run build` ✅
- `npm run exports:smoke` ✅ (Atlex + Demo)
- `npm run mobile:smoke` ✅ (Atlex + Demo)
- `npm run smoke:all` ✅ (all steps)

Beispielauszug (Exports):
- Jobs erstellt → Status DONE → CSV Download valid

---

## Notes / Observed
- Exports Smoke speichert lokale CSV als `downloaded-*.csv` (gitignored).
- `smoke:all` wurde explizit Windows-safe gemacht, um `spawn EINVAL` zu eliminieren.

---

## Offene Punkte (optional)
- Lint-Warnings in `tools/smoke/mobile-smoke.mjs` (unused eslint-disable) können bei Bedarf auf 0 reduziert werden (nicht blocker, da DoD: Warnings ok).

---

## Dateien (wesentlich)
- `tools/smoke/smoke-all.mjs`
- `tools/smoke/exports-smoke.mjs`
- `docs/LeadRadar2026A/04_RUNBOOK.md`
- `docs/LeadRadar2026A/05_RELEASE_TESTS.md`
- `docs/teilprojekt-4.0-golive-readiness-pack.md`
