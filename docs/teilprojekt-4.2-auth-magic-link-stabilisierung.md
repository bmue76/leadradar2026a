# Schlussrapport — Teilprojekt 4.2: Auth Magic Link Stabilisierung (eingeschoben) — ONLINE-only (MVP)

Status: DONE ✅  
Datum: 2026-01-19  
Commit(s): <NACH_COMMIT_EINFUEGEN>

## Ziel
TP 4.2 wurde kurzfristig eingeschoben, weil Teilprojekt 4.1 (OCR) durch Login-/Auth-Probleme blockiert war.
Ziel war ein realitätsnaher Login-Flow (Magic Link inkl. Email) und stabile Admin-API Calls ohne 401-Schleifen.

## Umsetzung (Highlights)
- Magic-Link Login via NextAuth/Auth.js integriert (SMTP Metanet).
- Prisma v7 “client engine” Requirement erfüllt via Postgres Adapter (`@prisma/adapter-pg`).
- Admin-API Auth robust gemacht: akzeptiert NextAuth Session (Magic Link) zusätzlich zur Legacy-Session.
- DEV-Comfort: Auto-Tenant-Create + Auto-Assign für User ohne tenantId (verhindert „Account hängt“).
- Admin Fetch sendet Cookies zuverlässig (`credentials: include`) → keine 401 durch fehlende Cookies.

## Dateien/Änderungen
- Auth/Auth.js: `src/auth.ts`, `src/app/api/auth/[...nextauth]/`, `src/types/next-auth.d.ts`
- Middleware/Session Bridge: `middleware.ts`, `src/lib/auth.ts`
- Prisma Client/Adapter: `src/server/prisma.ts`, `package.json`, `package-lock.json`
- Auth APIs / UI: `src/app/(auth)/login/page.tsx`, `src/app/api/auth/*`
- Admin API Fetch: `src/app/(admin)/admin/_lib/adminFetch.ts`
- DB: `prisma/schema.prisma`, `prisma/migrations/20260118*_auth_magic_link/`

## Akzeptanzkriterien – Check
- Login via Magic Link funktioniert (Mail kommt an, Callback ok).
- Admin UI lädt ohne 401, Form Create und Logo Upload funktionieren.
- Tenant-Scope bleibt erhalten (tenantId wird DEV-only sauber gesetzt, prod unverändert restriktiv).

## Tests/Proof (reproduzierbar)
- `npm run typecheck` → grün
- `npm run lint` → grün
- `npm run build` → grün
- Manueller Smoke:
  - Login: `/login` → Magic Link → `/admin`
  - API: `/api/admin/v1/tenants/current` → 200
  - Form Create + Branding Logo Upload → OK

## Offene Punkte/Risiken
- SMTP Credentials wurden im Chat offengelegt → Passwort rotieren (Metanet) (P0).
- DEV Auto-Tenant-Create/Assign ist bewusst DEV-only; für Production Onboarding später sauberer Tenant-Registration Flow.

## Next Step
Zurück zu Teilprojekt 4.1 (OCR): OCR Pipeline end-to-end finalisieren (DB → API → UI → Tests).
