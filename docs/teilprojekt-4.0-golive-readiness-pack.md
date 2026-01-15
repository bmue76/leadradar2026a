# Schlussrapport — Teilprojekt 4.0: GoLive Readiness Pack (Release Tests + Smoke Suite + Runbook Hardening) — ONLINE-only (MVP)

Status: DONE ✅  
Datum: 2026-01-15  
Commit(s): e0cb9aa, 49c5bcd

---

## Ziel

GoLive-/Betriebsreife erhöhen durch:
- reproduzierbare Smoke-/Release Checks (Auth, Events/Guardrails, Mobile, Exports)
- gehärtetes Runbook (Setup/Reset/Troubleshooting)
- keine neuen Produktfeatures (nur Ops/Quality)

---

## Umsetzung (Highlights)

- **Neue Smoke-Suite (reproduzierbar, tenant-übergreifend)**
  - `mobile:smoke`: Provision Claim → x-api-key → forms list → lead create (+ optional attachment best-effort)
  - `exports:smoke`: export job create → poll until DONE → download → minimal asserts
  - `smoke:all`: Orchestrierung über alle Smokes inkl. bestehender `auth:smoke` und `events:smoke`

- **Robustes Smoke-Framework**
  - Shared Helpers in `tools/smoke/_smoke-lib.mjs`:
    - jsonOk/jsonError tolerant parsing
    - aussagekräftige Fehlerausgabe (code/message/details/traceId) bei 4xx
    - Pick/Heuristics für Items-Arrays und Lead-Values

- **Mobile Auth Hardening (für Smoke-Readiness)**
  - Anpassungen/Hardening in `src/lib/mobileAuth.ts` (MVP-kompatibel), sodass deviceId/apiKey Auflösung für mobile Flows konsistent funktioniert.

- **Docs / Runbook gehärtet**
  - `04_RUNBOOK.md`: Setup, Release-Checks, Reset/Cleanup der DEV-Stubs, Troubleshooting via traceId
  - `05_RELEASE_TESTS.md`: Standard-Release-Checks + detaillierte Smoke-Dokumentation inkl. ENV Overrides (ohne Secrets)

---

## Dateien / Änderungen

### Code / Tools
- `tools/smoke/_smoke-lib.mjs`
- `tools/smoke/mobile-smoke.mjs`
- `tools/smoke/exports-smoke.mjs`
- `tools/smoke/smoke-all.mjs`
- `package.json` (neue npm scripts: `mobile:smoke`, `exports:smoke`, `smoke:all`)
- `src/lib/mobileAuth.ts` (Hardening für Mobile Smoke-Readiness)

### Docs
- `docs/LeadRadar2026A/04_RUNBOOK.md` (Hardening)
- `docs/LeadRadar2026A/05_RELEASE_TESTS.md` (Erweiterung / Smoke Suite)

---

## Akzeptanzkriterien — Check ✅

- [x] Neue Smoke Scripts vorhanden:
  - [x] `npm run mobile:smoke`
  - [x] `npm run exports:smoke`
  - [x] `npm run smoke:all` (auth + events + mobile + exports)
- [x] Docs Update:
  - [x] `docs/LeadRadar2026A/05_RELEASE_TESTS.md` erweitert
  - [x] `docs/LeadRadar2026A/04_RUNBOOK.md` gehärtet
- [x] Proof:
  - [x] Smokes grün (auth/events/mobile/exports)
  - [x] typecheck/lint/build grün (Warnings ok)
- [x] Keine Secrets in Git (ENV nur lokal/Hosting)

---

## Tests / Proof (reproduzierbar)

### Static Checks
```bash
npm run typecheck
npm run lint
npm run build
Smoke Suite
bash
Code kopieren
npm run smoke:all
Einzel-Smokes
bash
Code kopieren
npm run auth:smoke
npm run events:smoke
npm run mobile:smoke
npm run exports:smoke
Hinweise:

tenant scope bleibt leak-safe (mismatch ⇒ 404 NOT_FOUND).

Standard Responses & traceId Pattern bleiben erhalten; Smokes geben traceId bei Errors aus.

Offene Punkte / Risiken
P1 — Lint Warnings in Tools: ESLint meldet ggf. Warnings (keine Errors). Optional später auf 0 Warnings polieren (nicht GoLive-blocking).

P1 — Staging/Prod Smoke Accounts: In Staging/Prod braucht es dedizierte Smoke-User/Flows (DEV Debug Auth nicht verwenden).

Next Step
Teilprojekt 4.1 (optional, wenn gewünscht):

Lint-Warnings in Smoke-Tools auf 0 bringen

Smoke-All Orchestrierung weiter vereinheitlichen (Windows/Spawn Robustheit final absichern)

Staging/Prod Smoke-Konzept (dedizierte Accounts + env gating) dokumentieren
