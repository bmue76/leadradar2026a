# Schlussrapport — Teilprojekt 4.2: Auth Magic Link Stabilisierung (eingeschoben) — ONLINE-only (MVP)

Status: DONE ✅  
Datum: 2026-01-19  
Commit(s): fd00481, <DOCS_COMMIT>

## Ziel
Dieses Teilprojekt wurde **eingeschoben**, weil Teilprojekt 4.1 (OCR) durch Login-/401-Probleme blockiert war.
Ziel war ein realitätsnaher Login-Flow (Magic Link inkl. Email) und stabile Admin-API Calls ohne 401-Schleifen.

## Umsetzung (Highlights)
- Magic-Link Login via NextAuth/Auth.js integriert (SMTP Metanet).
- Prisma v7 “client engine” Requirement erfüllt via Postgres Adapter (`@prisma/adapter-pg`).
- Admin-API Auth robust gemacht: akzeptiert NextAuth Session zusätzlich zur Legacy-Session (`lr_session`).
- DEV-Comfort: Auto-Tenant-Create + Auto-Assign für User ohne tenantId (verhindert festhängende Accounts).
- Admin Fetch sendet Cookies zuverlässig (`credentials: include`) → keine 401 durch fehlende Cookies.

## Dateien/Änderungen (Auszug)
- Auth/Auth.js: `src/auth.ts`, `src/app/api/auth/[...nextauth]/`, `src/types/next-auth.d.ts`
- Prisma Adapter: `src/server/prisma.ts`, `package.json`, `package-lock.json`
- Session Bridge: `middleware.ts`, `src/lib/auth.ts`
- Auth UI / Routes: `src/app/(auth)/login/page.tsx`, `src/app/api/auth/*`
- Admin API Fetch: `src/app/(admin)/admin/_lib/adminFetch.ts`
- DB/Migrations: `prisma/schema.prisma`, `prisma/migrations/20260118*_auth_magic_link/`

## Akzeptanzkriterien – Check
- Magic Link Login funktioniert (Mail kommt an, Callback ok). ✅
- Admin UI lädt ohne 401; Form Create und Logo Upload funktionieren. ✅
- Tenant-Scope bleibt erhalten (DEV-only Auto-Assign, Prod unverändert restriktiv). ✅

## Tests/Proof (reproduzierbar)
- `npm run typecheck` → grün ✅
- `npm run lint` → grün ✅
- `npm run build` → grün ✅
- Manueller Smoke:
  - `/login` → Magic Link → `/admin`
  - `/api/admin/v1/tenants/current` → 200
  - Form Create + Branding Logo Upload → OK

## Offene Punkte/Risiken
- P0: SMTP Passwort rotieren (wurde im Chat offengelegt).
- P1: Production Onboarding später sauberer Tenant-Registration Flow (DEV Auto-Assign bleibt DEV-only).

## Next Step
Zurück zu Teilprojekt 4.1 (OCR): OCR Pipeline end-to-end finalisieren (DB → API → UI → Tests).
