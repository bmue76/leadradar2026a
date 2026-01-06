# LeadRadar2026A – Runbook (Local/Deploy)

Stand: 2026-01-06

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

---

## Environment Variables

### Required (Local Dev)
- `DATABASE_URL` – Postgres connection
- `AUTH_SESSION_SECRET` – Session/Auth Secret (>= 32 chars)
- `MOBILE_API_KEY_SECRET` – TP 2.5: HMAC Secret für ApiKey Hashing (>= 32 bytes empfohlen)

### Optional / Dev Convenience
- `NEXT_PUBLIC_DEFAULT_TENANT_SLUG`
- `NEXT_PUBLIC_TENANT_SLUG_DEV`
- Seed-bezogene Variablen (falls im Seed-Skript genutzt):
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
- Ablage im Passwortmanager (1Password/Bitwarden) oder Hosting Environment (z.B. Vercel).
- Optional: `docs/LeadRadar2026A/_private/SECRETS_PRIVATE.md` (gitignored)

Rotation/Incident:
- Wenn ein Secret/ApiKey irgendwo publik wurde: **rotieren** (neues Secret setzen / Keys neu erstellen).

---

## Prisma / DB

### Migrations
- Local: `npx prisma migrate dev`
- Deploy: `npx prisma migrate deploy`

### Seed
- `npx prisma db seed`

TP 2.5 Seed Verhalten:
- Wenn `MOBILE_API_KEY_SECRET` fehlt oder zu kurz ist, wird Mobile Seed (ApiKeys/Devices) übersprungen.
- Wenn gesetzt, erzeugt der Seed pro Tenant einen Demo ApiKey + Device und loggt den Klartext-Token einmalig in die Konsole.
- Diese Klartext-Tokens sind nur für DEV/Proof gedacht (nicht in Docs/Repo übernehmen).

---

## Mobile ApiKey Auth (TP 2.5)

### Überblick
- Mobile Requests müssen `x-api-key: <token>` senden.
- ApiKeys werden in der DB nur als Hash gespeichert (HMAC-SHA256 + `MOBILE_API_KEY_SECRET`).
- Klartext Key wird nur einmalig beim Create angezeigt (Admin UI / Admin API).

### Key Rotation (operativ)
Empfohlenes Vorgehen:
1) Neuen ApiKey erstellen (Admin: `/admin/settings/devices` oder Admin API)
2) Mobile Client auf neuen Key umstellen
3) Alten Key revoken (Admin revoke)
4) Optional: Device-Zuweisungen prüfen/aktualisieren

### Device Form Assignment
- Mobile Endpoints liefern/akzeptieren nur Forms, die dem Device zugewiesen sind.
- Unassigned => 404 NOT_FOUND (leak-safe).

---

## Rate Limiting (Phase 1 – best-effort)

- Implementiert als In-Memory Rate Limiter pro ApiKey.
- Limitation: Bei Multi-Instance / Serverless ist das nicht global konsistent.
- Upgrade-Pfad: Redis/Upstash o.ä. (Phase 2/3).

Fehler:
- `429 RATE_LIMITED` via jsonError, inkl. `traceId` und `x-trace-id`.

---

## Troubleshooting

### Trace IDs
- Jede API Response enthält:
  - Header: `x-trace-id`
  - Body: `traceId`
- Bei Support/Debug immer `traceId` mitschicken.

### Leak-safe 404
- 404 kann bedeuten:
  - Resource existiert nicht, oder
  - Resource gehört zu anderem Tenant, oder
  - Form ist nicht assigned (Mobile)
Das ist beabsichtigt (keine Informationsleaks).

### Häufige Checks
- `npm run typecheck` / `npm run lint` / `npm run build`
- `npx prisma generate`
- `npx prisma db seed`
- Curl Proofs (siehe Teilprojekt-Doku TP 2.5)

---

## Deploy (High-level)

- Secrets als Environment Variables im Hosting setzen (nicht im Repo).
- `DATABASE_URL`, `AUTH_SESSION_SECRET`, `MOBILE_API_KEY_SECRET` sind Pflicht für Produktivbetrieb.
- Migrations: `npx prisma migrate deploy` im Deploy-Prozess.
- Storage/Exports je nach Setup (Runbook erweitert sich mit Infrastrukturentscheid).

