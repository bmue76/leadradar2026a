# LeadRadar2026A – Runbook (Local/Deploy)

Stand: 2026-01-09

---

## Local Setup (Windows/Git Bash)

Voraussetzungen:
- Node LTS
- PostgreSQL lokal oder Cloud Dev DB
- `.env.local` (nicht committen)
- Prisma Migrations angewendet

Start:
- `npm install`
- `npm run dev`

---

## Scripts (Baseline)

- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm run db:seed`

---

## Environment Variables

### Required (Local Dev)
- `DATABASE_URL` – Postgres connection
- `AUTH_SESSION_SECRET` – Session/Auth Secret (>= 32 chars)
- `MOBILE_API_KEY_SECRET` – HMAC Secret für ApiKey Hashing (>= 32 bytes empfohlen)

### Optional / Dev Convenience
- `NEXT_PUBLIC_DEFAULT_TENANT_SLUG`
- `NEXT_PUBLIC_DEV_USER_ID`

Seed (optional):
- `SEED_TENANT_SLUG`
- `SEED_TENANT_NAME`
- `SEED_OWNER_EMAIL`
- `SEED_OWNER_PASSWORD`

WICHTIG:
- `.env.example` enthält niemals echte Secrets.
- `.env.local` bleibt lokal und wird nicht committed.

---

## Secrets Handling (WICHTIG)

- Echte Secrets niemals im Repo.
- Ablage im Passwortmanager oder Hosting Environment.
- Optional: `docs/LeadRadar2026A/_private/SECRETS_PRIVATE.md` (gitignored)

Rotation/Incident:
- Wenn ein Secret/ApiKey publik wurde: rotieren (neues Secret setzen / Keys neu erstellen).

---

## Prisma / DB

### Migrations
- Local: `npx prisma migrate dev`
- Deploy: `npx prisma migrate deploy`

### Seed
- `npm run db:seed` (Alias für `prisma db seed`)

Hinweis:
- Seed legt standardmäßig einen Demo-Tenant an (z.B. `tenant_demo`).
- Für Atlex (oder andere) kann via `SEED_TENANT_SLUG=atlex` etc. gesteuert werden (abhängig vom Seed-Skript).
- Mobile Seed erzeugt (DEV-only) einen Demo ApiKey + Device und loggt den Klartext-Token einmalig in die Konsole.

---

## Mobile ApiKey Auth (TP 2.5)

### Überblick
- Mobile Requests müssen `x-api-key: <token>` senden.
- ApiKeys werden in der DB nur als Hash gespeichert (HMAC-SHA256 + `MOBILE_API_KEY_SECRET`).
- Klartext Key wird nur einmalig beim Create angezeigt (Admin UI / Admin API).

### Key Rotation (operativ)
1) Neuen ApiKey erstellen (Admin: `/admin/settings/mobile`)
2) Mobile Client auf neuen Key umstellen
3) Alten Key revoken
4) Assignments prüfen/aktualisieren

### Device Form Assignment
- Mobile Endpoints liefern/akzeptieren nur Forms, die dem Device zugewiesen sind.
- Unassigned => 404 NOT_FOUND (leak-safe).

---

## Demo Capture (DEV-only)

Route: `/admin/demo/capture`

Key Handling:
- Demo Capture liest Key aus LocalStorage:
  - `leadradar.devMobileApiKey` (neu)
  - `lr_demo_capture_mobile_api_key` (legacy)
- Optional: `?key=<token>` in der URL:
  - übernimmt den Key (schreibt LocalStorage)
  - entfernt den QueryParam danach automatisch (URL cleanup)

Empfohlenes Ops-Flow:
- ApiKey in `/admin/settings/mobile` erzeugen → “Use for Demo Capture” klicken → Leads generieren.

---

## Rate Limiting (Phase 1 – best-effort)

- In-Memory Rate Limiter pro ApiKey.
- Limitation: bei Multi-Instance / Serverless nicht global konsistent.
- Upgrade: Redis/Upstash (Phase 2/3).

Fehler: `429 RATE_LIMITED` via jsonError inkl. `traceId`.

---

## Troubleshooting

### Trace IDs
Jede API Response enthält:
- Header: `x-trace-id`
- Body: `traceId`

### Leak-safe 404
404 kann bedeuten:
- Resource existiert nicht, oder
- Resource gehört zu anderem Tenant, oder
- Form ist nicht assigned (Mobile)
Das ist beabsichtigt.

### Häufige Checks
- `npm run typecheck` / `npm run lint` / `npm run build`
- `npm run db:seed`
