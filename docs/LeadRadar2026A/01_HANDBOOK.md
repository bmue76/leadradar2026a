# LeadRadar2026A — Handbook (verbindlich)

## Prozess pro Teilprojekt (immer gleich)
**DB → API → UI(Screen) → Tests/Proof → Schlussrapport → Commit/Push**

## Non-Negotiables
### Tenant-Scope & Leak-Safety
- Jede tenant-owned Entity ist **tenantId-scoped**
- Mismatch (falscher Tenant/ID) ⇒ **404 NOT_FOUND** (kein Leak)

### API Standards
- Responses: `jsonOk/jsonError`
- `traceId` im Body + `x-trace-id` Header
- Validation ausschließlich via Zod + `validateBody/validateQuery` aus `src/lib/http.ts`

### Code-Regeln
- Keine Snippets: bei Änderungen immer komplette Dateien.
- Alles copy/paste-fähig (Git Bash), bevorzugt `cat > ... <<'EOF'`.
- Pfade mit Klammern bei `git add` immer quoten.

## Prisma v7 Hinweis (wichtig)
- Connection URL liegt in `prisma.config.ts` (nicht mehr im schema).
- `prisma generate` muss explizit laufen (postinstall/prebuild/pretypecheck).

## UX/Polish ist Teil des DoD
- Jeder Screen: Loading/Empty/Error States
- Klare Texte, sinnvolle Defaults
- Keine Debug-UI im Produkt

## Definition of Done (DoD)
- `npm run typecheck` → 0 Errors
- `npm run lint` → 0 Errors (Warnings ok)
- `npm run build` → grün, wenn build-relevant
- Reproduzierbarer Proof (curl/UI/Test)
- Docs aktualisiert + Schlussrapport committed
- `git status` clean + Push + Hash im Rapport

## Auth (MVP) – Admin Login + Session
- Session via **httpOnly Cookie** (signiert, HMAC-SHA256)
- Cookie Policy: SameSite=Lax, Secure in prod
- Admin Protection:
  - `/admin/*` redirect to `/login` wenn nicht eingeloggt
  - `/api/admin/v1/*` → `401 UNAUTHENTICATED`
- Secrets ausschließlich in `.env.local`:
  - `AUTH_SESSION_SECRET`
  - `SEED_OWNER_PASSWORD` (Bootstrap, setzt beim ersten Login `passwordHash`)
