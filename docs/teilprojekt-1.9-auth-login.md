# Teilprojekt 1.9 – Auth MVP + Login (Route Protection + User Menu)

Status: ✅ DONE  
Datum: 2026-01-02  
Commit(s): _TBD_

## Ziel
- Login-Seite (/login) Apple-clean
- Session Auth via httpOnly Cookie (signiert)
- Schutz:
  - /admin/* → ohne Session Redirect /login
  - /api/admin/v1/* → ohne Session 401 UNAUTHENTICATED
- Topbar: User Menu (Name/Email + Logout)
- Keine Secrets im Repo (nur .env.local)

## Umsetzung (Highlights)
- Signierte Session Tokens (HMAC-SHA256) kompatibel mit Node + Edge (Middleware)
- Cookie: httpOnly, SameSite=Lax, Secure in prod
- Middleware schützt Admin UI + Admin APIs und injiziert x-user-id/x-tenant-id (kompatibel zu bestehenden Tenant-Context Patterns)
- Credentials Login (Email + Password) mit scrypt Hash im DB Feld `passwordHash`
- Bootstrap: falls passwordHash leer, erlaubt SEED_OWNER_PASSWORD einmalig (setzt dann Hash)

## Dateien/Änderungen
- prisma/schema.prisma: User.passwordHash + User.lastLoginAt (Migration add_user_passwordhash)
- src/lib/authSession.ts
- src/lib/auth.ts
- src/app/api/auth/login/route.ts
- src/app/api/auth/logout/route.ts
- src/app/api/auth/me/route.ts
- src/app/login/page.tsx
- middleware.ts
- src/app/(admin)/admin/_components/UserMenu.tsx
- src/app/(admin)/admin/_components/Topbar.tsx
- docs/teilprojekt-1.9-auth-login.md

## Akzeptanzkriterien – Check
- [ ] /admin ohne Session → Redirect /login
- [ ] Login gültig → /admin lädt
- [ ] Logout → zurück zu /login
- [ ] /api/admin/v1/forms ohne Session → 401 UNAUTHENTICATED
- [ ] typecheck/lint/build grün
- [ ] reproduzierbarer Proof (curl/UI) dokumentiert

## Tests/Proof (reproduzierbar)
- curl -I http://localhost:3000/admin  → 307/308 nach /login
- curl -i http://localhost:3000/api/admin/v1/forms → 401
- curl login → Set-Cookie erhalten → forms 200
- logout → cookie cleared → forms 401
- npm run typecheck / lint / build

## Offene Punkte/Risiken
- P1: Admin API Routes können optional zusätzlich `requireAdminAuth(req)` verwenden (Defense-in-depth). Middleware deckt aktuell 401 zuverlässig ab.
- P1: Rollenmodell später erweitern (TENANT_ADMIN etc.) + UI für Userverwaltung.

## Next Step
- TP 2.0: UX Polish Round (Login + Admin Shell micro-polish) ODER
- TP 2.0: Admin “Users” Screen (Owner-only) inkl. Set Password / Invite
