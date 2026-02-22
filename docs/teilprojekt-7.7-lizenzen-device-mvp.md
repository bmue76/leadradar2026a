# Teilprojekt 7.7 — Lizenzen (Device-Lizenz 30/365) statt Credits + Stripe Checkout Fix

Status: IN ARBEIT  
Datum: 2026-02-21  
Scope: GoLive-MVP (ONLINE-only)

## Ziel

Für GoLive wird Credits/Wallet entfernt (nicht gelöscht, aber nicht mehr genutzt).  
Stattdessen gibt es pro Device genau zwei Lizenztypen:

- **Messelizenz (FAIR_30D)**: 30 Tage
- **Jahreslizenz (YEAR_365D)**: 365 Tage

Admin kann eine Device-Lizenz kaufen (Stripe) oder im Notfall manuell aktivieren.  
Mobile kann zuverlässig prüfen: **Gerät nutzbar = Lizenz aktiv bis Datum X**.

Hinweis: Das entspricht auch dem historischen LeadRadar Lizenzmodell (30 Tage / 1 Jahr).

## Nicht-Ziele (Out of Scope für GoLive)

- Credits/Wallet/Saldo/Transfer
- Subscriptions/Proration
- Invoice-PDF/Accounting-Export

---

## Architektur-Entscheide (fix)

### Lizenz-Logik

- Aktiv gilt: `status = ACTIVE` **und** `endsAt > now`
- Verlängerung: `base = max(now, currentEndsAt)` → `endsAt = base + durationDays`
- History: Jede Aktion erzeugt einen neuen Record (keine In-Place Mutation der Vergangenheit).

### Tenant-Scope / Leak-Safety

- Alle tenant-owned Lookups immer `{ id, tenantId }` bzw. `findFirst({ where: { id, tenantId }})`
- Scope mismatch: **404 NOT_FOUND** (kein Leak)

### Stripe

- Checkout: `mode=payment`, Price pro Typ über ENV
- Webhook: `checkout.session.completed` → DeviceLicense anlegen/verlängern
- Idempotenz: License-Record enthält `stripeSessionId` (unique), um Retries sauber zu machen

---

## Deliverables

### 1) DB

- Prisma: `DeviceLicense` Model + Enum `DeviceLicenseType`
- Indizes: `(tenantId, deviceId)`, `endsAt`, optional `stripeSessionId unique`
- Migration via Prisma Migrate

### 2) API

Admin:
- `GET /api/admin/v1/devices/:id/license` (current + optional history)
- `POST /api/admin/v1/devices/:id/license/checkout` body `{ type }` → `{ checkoutUrl }`
- `POST /api/admin/v1/devices/:id/license/manual` (Owner-only) → erstellt Lizenz record

Stripe Webhook:
- erweitert um `checkout.session.completed` für DeviceLicense

Mobile:
- `GET /api/mobile/v1/license` → `{ isActive, endsAt, type }`

Standards:
- überall `jsonOk/jsonError` + `traceId` + `x-trace-id`
- Validation nur via `Zod` + `validateBody/validateQuery`

### 3) UI

- Navigation: “Abrechnung” → “Lizenzen”
- Credits UI entfernen/ausblenden
- Geräte-Liste: Lizenz-Badge “Aktiv bis …” / “Keine aktive Lizenz”
- CTA: “Lizenz kaufen” (Modal/Drawer), optional “Verlängern”
- Owner-only: “Manuell aktivieren”
- States: Skeleton / Empty / Error (TraceId + Retry)

---

## Akzeptanzkriterien (DoD)

- `npm run typecheck` → 0 errors
- `npm run lint` → 0 errors (warnings ok)
- `npm run build` → grün (falls relevant)
- Migration läuft sauber
- `git status` clean
- Reproduzierbarer Proof: DB, Admin Checkout URL, Webhook creates license, Admin zeigt “Aktiv bis…”, Mobile liefert `isActive=true`

---

## Proof / Smoke Steps (Template)

### DB
- `npx prisma migrate dev --name tp77_device_licenses`
- `npx prisma studio` → DeviceLicense sichtbar, Relations ok

### Admin API
- `curl -H "x-tenant-slug: atlex" ... GET /api/admin/v1/devices/<id>/license`
- `curl -H "x-tenant-slug: atlex" -H "content-type: application/json" -d '{"type":"FAIR_30D"}' ... POST /api/admin/v1/devices/<id>/license/checkout`

### Stripe (lokal, falls stripe-cli vorhanden)
- `stripe listen --forward-to localhost:3000/<webhook-path>`
- Checkout abschliessen → Webhook fired → DB Record erstellt

### Mobile
- `curl -H "x-tenant-slug: atlex" -H "x-device-token: ..." ... GET /api/mobile/v1/license`

---

## Offene Punkte / Risiken

- Welche bestehenden Credits/Billing Screens/Routes müssen entfernt vs. nur verborgen werden?
- Wo genau ist der aktuelle Stripe Webhook / Checkout Code (Pfad + Metadata)?
- Welche Device Context Header nutzt Mobile in deinem Projekt (deviceToken/deviceId)?

---

## Next Step

1) Ist-Dateien sammeln (Schema, Webhook, Checkout/Credits, Nav, Devices UI, Mobile Activation)
2) DB implementieren + Migration
3) Admin API implementieren
4) Stripe Webhook erweitern
5) UI Screen “Lizenzen” + Devices Badge/CTA
6) Proof + Doku Updates + Commits
