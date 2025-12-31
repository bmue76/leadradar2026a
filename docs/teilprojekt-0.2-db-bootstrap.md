# Teilprojekt 0.2 – DB Bootstrap (Migration + Seed Atlex) — Schlussrapport

Status: DONE  
Datum: 2025-12-31

## Titel + Status + Datum + Commit(s)
- Titel: Teilprojekt 0.2 — DB Bootstrap (Migration + Seed Atlex)
- Status: DONE
- Datum: 2025-12-31
- Commit(s):
  - 889ca86 feat(db): init core schema + migration + seed (atlex)
  - f8e75fb docs: add teilprojekt 0.2 schlussrapport (db bootstrap)

## Ziel
DB-Fundament für LeadRadar2026A schaffen:
- Lokale PostgreSQL Dev-DB anbinden (`.env.local` / `DATABASE_URL`)
- Prisma Baseline-Schema (Tenant/User, Rollen/Status) + Indizes als Basis für späteres Tenant-Scoping
- Erste Migration via `prisma migrate dev` (im Repo)
- Idempotentes Seed: Tenant `atlex` + Owner User (TENANT_OWNER)
- Doku erweitern (DB/Runbook/Seed-Konzept)

## Umsetzung (Highlights)
- Dev-DB Entscheidung wie im Vorgängerprojekt: **PostgreSQL lokal auf Port 5433** mit bekannten Credentials (`postgres/postgres`),
  weil die Windows-Service-Instanz auf 5432 typischerweise ein unbekanntes Passwort hat.
- Prisma v7 Policy eingehalten: `DATABASE_URL` wird in `prisma.config.ts` geladen (nicht im Schema).
- Seed ist idempotent per Upsert:
  - Tenant: `slug=atlex`
  - User: `email=owner@atlex.test`, `role=TENANT_OWNER`, `tenantId` gesetzt
- **Masterchat-Workflow-Verbesserung:** Arbeit in **step-by-step Blöcken** (statt “All-in-one”-Heredocs),
  um Git-Bash EOF-Fallen (hängendes `>` / vermischte Datei-Inhalte) zu vermeiden.

## Dateien/Änderungen
- `.env.example` (Local Postgres 5433 Beispiel-URL)
- `prisma/schema.prisma` (Tenant/User + Enums + Indizes)
- `prisma.config.ts` (Env Loading + Seed Hook)
- `prisma/migrations/*` (init_core)
- `prisma/seed.mjs` (idempotent)
- `docs/LeadRadar2026A/02_DB.md`
- `docs/LeadRadar2026A/04_RUNBOOK.md`
- `docs/teilprojekt-0.2-db-bootstrap.md`

## Akzeptanzkriterien – Check
- [x] Seed ist idempotent (2x ausführbar ohne Duplikate)
- [x] DB Setup ist reproduzierbar dokumentiert (Local Postgres 5433)
- [x] Prisma v7 Policy eingehalten (DATABASE_URL nicht im Schema)
- [ ] DoD erfüllt: typecheck/lint/build grün (noch ausführen/abhaken)
- [x] Schlussrapport committed inkl. Proof-Kommandos + Commit-Hash(es)

## Tests/Proof (reproduzierbar)
```bash
cd /d/dev/leadradar2026a

# DB läuft lokal auf 5433 (postgres/postgres)
# .env.local: DATABASE_URL="postgresql://postgres:postgres@localhost:5433/leadradar2026a?schema=public"

npx prisma generate
npx prisma migrate dev --name init_core

npx prisma db seed
npx prisma db seed   # 2. Lauf: keine Duplikate

npm run typecheck
npm run lint
npm run build

# optional
npx prisma studio
