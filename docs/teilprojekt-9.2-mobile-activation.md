# Teilprojekt 9.2: Mobile Activation Gate — Lizenz/Provisioning aktivieren + State Persistenz + UI-Gate

**Status:** DONE  
**Datum:** 2026-03-02 (Europe/Zurich)  
**Commit(s):**
- <HASH_1> — feat(tp9.2): mobile activation gate + license state persistence
- <HASH_2> — docs(tp9.2): document activation gate + release tests

---

## Ziel

GoLive-ready (Phase 1 ONLINE-only) Activation/Lizenz-Gate für die Mobile App:

- Activation Screen: Aktivierungscode eingeben/pasten + „Aktivieren“
- Persistenz: Activation State + apiKey + expiresAt (falls verfügbar) in SecureStore
- Global Gate (Router): ohne aktive Lizenz kein Zugriff auf geschützte Screens
- Standard API Integration: jsonOk/jsonError + traceId sichtbar im Fehlerfall
- Terminologie (User-facing): „Tenant“ → „Konto / Konto-Kürzel“ (technisch bleibt tenantSlug/x-tenant-slug)

---

## Umsetzung (Highlights)

### Mobile (apps/mobile)

- **Activation Flow**
  - Redeem via `POST /api/mobile/v1/provisioning/redeem` mit `{ tenantSlug, code }`
  - Persistiert `apiKey` und Metadaten lokal
  - Optionaler Lizenzcheck via `GET /api/mobile/v1/license` zur Ableitung von `expiresAt` und aktiv/inaktiv

- **State Persistenz**
  - SecureStore: `status`, `apiKey`, `activatedAt`, `lastCheckedAt`, optional `expiresAt`
  - App-Restart überlebt zuverlässig

- **Router Gate**
  - App Start → wenn nicht aktiv → `/activate`
  - Wenn aktiv → normaler Flow (z.B. `/forms`)
  - Settings bleibt erreichbar, um Base URL / Konto-Kürzel zu korrigieren

- **Microcopy (de-CH)**
  - „Konto-Kürzel“ statt „Tenant“
  - klare States: idle/loading/success/error
  - traceId bei Server-Errors sichtbar

### Admin (UX-Polish, ohne Backend-Breaking)

- E-Mail Template Provisioning (no-reply) Apple-clean: **Code kopieren**, QR, klare Option A/B.
- Device Setup Drawer: bei `NO_ACTIVE_TOKEN` → UI erstellt automatisch neuen Code und sendet dann E-Mail (Backend bleibt strikt).

---

## Dateien/Änderungen

Mobile:
- `apps/mobile/app/_layout.tsx` (Gate/Redirect)
- `apps/mobile/app/license.tsx` (Konto/Konto-Kürzel wording / Gate-Support)
- `apps/mobile/src/lib/licenseState.ts` (Persistenz + Ableitungen)

Docs:
- `docs/teilprojekt-9.2-mobile-activation.md`
- `docs/LeadRadar2026A/00_INDEX.md` (Link ergänzt)
- `docs/LeadRadar2026A/05_RELEASE_TESTS.md` (Mobile Smoke erweitert)

(Weitere UI-Wording/Polish Files je nach Commit-Set)

---

## Akzeptanzkriterien – Check

- [x] Android Emulator + reales Android Device
  - [x] Aktivierung mit gültigem Code → Success → Gate öffnet geschützten Bereich
  - [x] Persistenz: App kill/restart → bleibt aktiv
  - [x] Ungültiger Code → Error + Retry + traceId (wenn Server erreicht)
  - [x] Expired/Inactive State: Gate greift und zeigt Hinweis (über /license abgeleitet)
- [x] Router Gate: geschützte Screens ohne aktive Lizenz nicht erreichbar
- [x] Code Quality:
  - [x] `npm run typecheck` → 0 Errors
  - [x] `npm run lint` → 0 Errors
  - [x] `cd apps/mobile && npm run lint` → 0 Errors
- [x] Docs + Index + Release Tests aktualisiert
- [x] git status clean, commit/push, Hash im Rapport

---

## Tests/Proof (reproduzierbar)

### Mobile Smoke
```bash
cd apps/mobile
npx expo start --dev-client -c

Flow (real device)

Einstellungen: Base URL + Konto-Kürzel setzen → Speichern

App → Activation Screen erscheint (wenn nicht aktiv)

Ungültiger Code → Error + traceId

Gültiger Code → Success → Redirect

App kill/restart → bleibt aktiv

Backend Proof (Provisioning + E-Mail)
TENANT_ID="..."
TENANT_SLUG="demo"
DEVICE_ID="..."
EMAIL_TO="..."

# 1) Code erstellen/holen
curl -sS -X POST "http://localhost:3000/api/admin/v1/devices/$DEVICE_ID/provisioning" \
  -H "content-type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-tenant-slug: $TENANT_SLUG"

# 2) E-Mail senden (strict: nur wenn aktiver Code existiert)
curl -sS -X POST "http://localhost:3000/api/admin/v1/devices/$DEVICE_ID/provisioning/resend" \
  -H "content-type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-tenant-slug: $TENANT_SLUG" \
  -d "{\"email\":\"$EMAIL_TO\"}"
Offene Punkte / Risiken

P1: Deep-Link Auto-Fill (QR scan → App übernimmt code/tenant automatisch) optionaler Komfort

P1: Konsolidierung mobileApi.ts vs apiFetch() (Single Source of Truth)

P1: „Tenant“ Terminologie technisch vs UI (bewusst getrennt)

Next Step

TP 9.3: Forms laden/anzeigen (nach Gate) + erste echte Screen-Flows
