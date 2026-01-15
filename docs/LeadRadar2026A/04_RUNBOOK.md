# 04_RUNBOOK — Setup / Reset / Troubleshooting (ONLINE-only MVP)

Ziel: Betriebssichere, reproduzierbare Abläufe für DEV und GoLive-Vorbereitung.
Scope: ONLINE-only (kein Offline-Modus).

Konventionen:
- **Keine Secrets in Git** (`.env.local` nur lokal / Hosting-ENV).
- **Tenant-scope leak-safe**: Mismatch => **404**.
- **Observability**: `x-trace-id` im Response Header, `traceId` im JSON Body.

---

## A) Setup (DEV)

### Voraussetzungen
- Node.js **>= 20**
- Postgres erreichbar (Connection via `.env.local`)
- Prisma installiert (via `prisma` devDependency)

### Install / Start (typisch)
```bash
npm install
npm run prisma:generate
npm run db:seed
npm run dev
Quick Health Checks
bash
Code kopieren
# Admin / Platform
curl -sS http://localhost:3000/api/admin/v1/health | head
curl -sS http://localhost:3000/api/platform/v1/health | head

# Mobile
curl -sS http://localhost:3000/api/mobile/v1/health | head
Hinweise:

db:seed ist DEV-only (nicht blind in Prod ausführen).

Prisma Migrations werden im Repo verwaltet.

B) Release / GoLive Checks (Kurz)
Pflicht-Checks vor Merge/Release (DEV/Staging):

bash
Code kopieren
npm run typecheck
npm run lint
npm run build
npm run smoke:all
Erwartung:

typecheck: 0 Errors

lint: 0 Errors (Warnings ok)

build: grün

smoke:all: PASSED (exit code 0)

Wenn ein Smoke rot ist: traceId notieren und mit Logs korrelieren.

C) Reset / Cleanup (DEV)
1) DEV Storage Stubs löschen
Im Repo existieren DEV-Stubs als lokale Verzeichnisse (gitignored):

.tmp_exports/

.tmp_attachments/

.tmp_branding/

Cleanup:

bash
Code kopieren
rm -rf .tmp_exports .tmp_attachments .tmp_branding
Danach:

npm run dev neu starten

betroffene Flows (Exports/Uploads/Branding) kurz prüfen

2) Download-Artefakte aus Smokes aufräumen
Exports-Smoke speichert CSV lokal (gitignored):

bash
Code kopieren
rm -f downloaded-*.csv
3) DEV DB Reset (nur wenn nötig)
Achtung: destruktiv. Nur wenn dein DEV-DB Zustand “kaputt” ist.

bash
Code kopieren
# Beispiel (nur wenn bei dir so üblich):
# prisma migrate reset --force
# npm run db:seed
D) Troubleshooting
1) traceId finden und nutzen
Standard:

Response Header: x-trace-id

Response Body: traceId

Vorgehen:

traceId aus Console/Response kopieren

Server-Logs nach traceId durchsuchen

Ursache beheben (Validation, Tenant Scope, Missing Config)

2) Auth-Login schlägt fehl (auth:smoke)
Symptome:

auth:smoke liefert HTTP 401/403 oder ok=false

Checks:

DEV Debug-Auth aktiv? (Header x-debug-auth: 1 wird vom Script gesetzt)

Seed/DEV-User vorhanden?

.env.local korrekt geladen?

Aktion:

bash
Code kopieren
npm run db:seed
# Server neu starten
npm run dev
3) smoke:all crashed: spawn EINVAL (Windows/Git Bash)
Ursache:

Windows spawn() Probleme bei npm Subprocesses.

Fix:

tools/smoke/smoke-all.mjs nutzt cmd.exe /c "npm run <script>" (Windows-safe).

Falls du das Problem wieder siehst: sicherstellen, dass du den aktuellen Runner nutzt.

4) Mobile Smoke: keine Forms / kein API Key / falsches Assignment
Typische Symptome:

"forms list ok but empty"

"missing apiKey"

"NOT_FOUND" bei Lead Create

Checks:

Tenant hat mind. 1 ACTIVE Form

Device ist ACTIVE und (falls Event Guardrails greifen) an ein ACTIVE Event gebunden

Form ist dem Device zugewiesen (PUT /api/admin/v1/mobile/devices/:id/forms)

Mobile Endpoints nutzen x-api-key + Tenant via x-tenant-slug (oder projektkonform)

Pragmatische Aktionen (DEV):

Form im Admin erstellen/aktivieren

Device in Mobile Ops provisionieren

Smoke erneut laufen lassen:

bash
Code kopieren
npm run mobile:smoke
Optional ENV Overrides:

MOBILE_SMOKE_BASE_URL

MOBILE_SMOKE_TENANT_SLUG_ATLEX, MOBILE_SMOKE_TENANT_SLUG_DEMO

Fallbacks: MOBILE_SMOKE_PROVISION_TOKEN oder MOBILE_SMOKE_API_KEY

5) Events Smoke: "no devices found"
events:smoke braucht pro Tenant mind. 1 Device.

Aktion:

In Admin → Mobile Ops ein Device provisionieren

Dann:

bash
Code kopieren
npm run events:smoke
6) Exports Smoke: Job bleibt RUNNING / Timeout
Checks:

Export Job wird erstellt, aber Verarbeitung hängt

Storage stub .tmp_exports/ existiert und ist beschreibbar

Aktion:

bash
Code kopieren
rm -rf .tmp_exports
npm run exports:smoke
7) Attachments Upload fails
Ursachen:

Endpoint erwartet multipart statt JSON

Storage stub/permissions

Request body size limits

Aktion:

.tmp_attachments reset

Upload via Admin UI / korrekten API Content-Type prüfen

Mobile Smoke: Attachment-Step ist optional/warn-only (je nach Config)

E) Minimal Operational Notes (MVP)
Tenant Scope: tenant-owned Zugriff ist immer tenantId-scoped, mismatch -> 404 (leak-safe).

Mobile Auth: x-api-key + Tenant-Resolution (z. B. x-tenant-slug) projektkonform.

Observability: traceId ist Standard und gehört in Troubleshooting immer dazu.
