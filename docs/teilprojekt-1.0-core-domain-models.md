# Teilprojekt 1.0 — Core Domain Models (Forms/Fields/Leads/Attachments/ExportJob) — Schlussrapport

Status: DONE  
Datum: 2025-12-31  
Commit(s):
- 5b945b9 feat(db): add core domain models (forms/leads/exports)

## Ziel

DB-seitig die GoLive-Core Entities ergänzen, damit danach Screen-by-Screen Admin & Mobile umgesetzt werden können:

- Form + FormField
- Lead + LeadAttachment (inkl. Idempotency + Soft-delete vorbereitet)
- ExportJob

Nebenbedingungen:

- tenant-scoped (Pflicht `tenantId`, Indizes auf Query-Pfade)
- leak-safe Lookups später `{ id, tenantId }`
- Prisma v7: Connection URL bleibt in `prisma.config.ts`

## Umsetzung (Highlights)

- Prisma Schema erweitert um Enums + Core Models.
- Idempotency auf Lead: `clientLeadId` mit `@@unique([tenantId, clientLeadId])`.
- Soft-delete Felder vorbereitet (noch keine API/Business-Logik im Scope).
- Indizes gemäß Query-Pfaden (tenantId-First).

Optional (Seed, empfohlen/minimal):
- Idempotenter Seed erzeugt Demo-Form „Kontakt“ für Tenant `atlex` (ohne Duplikate),
  inkl. minimaler Felder (firstName, lastName, email, company, phone, notes).

## Dateien / Änderungen

- `prisma/schema.prisma`
- `prisma/seed.mjs` (idempotent erweitert)
- `prisma/migrations/*` (auto-generiert via migrate dev)
- `docs/LeadRadar2026A/02_DB.md`
- `docs/teilprojekt-1.0-core-domain-models.md`

## Akzeptanzkriterien — Check

- [x] Enums + Models wie definiert (minimal robust)
- [x] tenantId Pflicht auf allen tenant-owned Entities
- [x] Indizes tenantId-scoped
- [x] Lead-Idempotency vorbereitet via Unique
- [x] Seed (optional) 2× ausführbar ohne Duplikate
- [x] typecheck / lint / build grün
- [x] Proof reproduzierbar dokumentiert
- [x] Schlussrapport committed, git status clean

## Tests / Proof (reproduzierbar)

```bash
cd /d/dev/leadradar2026a

npx prisma generate
npx prisma migrate dev --name add_core_models

# optional (Seed erweitert)
npx prisma db seed
npx prisma db seed   # 2. Lauf: keine Duplikate

npm run typecheck
npm run lint
npm run build

# optional: Sichtprüfung
npx prisma studio

