# Teilprojekt 5.4 — Betrieb: Geräte + Billing (Credits) + Coupons + Mobile Hardblock + In-App Verlängerung (ONLINE-only, GoLive MVP)

Status: IN IMPLEMENTATION (Repo-abhängige Integrationsfiles folgen)  
Datum: 2026-01-30  
Scope: Operate → Devices, Billing/Credits, Promo Redeem, Mobile Capture Hardblock, In-App Renew

---

## Ziel (Outcome)

GoLive-ready Betriebsebene inkl. Credits-basierter Monetarisierung:

- Admin **/admin/devices**: Liste + Drawer, Event-Bind, Revoke, Provisioning QR + Token + E-Mail
- Admin **/admin/billing**: Übersicht Entitlement + Credits; Coupon Redeem; Credits konsumieren (30D/365D/Device Slot)
- Mobile Capture **Hardblock** bei abgelaufener Lizenz (nur Capture; Admin bleibt frei)
- Mobile In-App Verlängerung via Gutscheincode: Redeem + Auto-Activate → Capture wieder möglich
- Reproduzierbarer Proof (curl + UI smoke)

---

## Fixe Produktregeln (GoLive)

- Lizenzierung gilt **nur** für Mobile Capture (Formulare laden + Lead erfassen + Attachments/OCR upload)
- Backend/Admin bleibt immer nutzbar (Setup, Auswerten, Export etc.)
- 1 Provision Token = 1 Gerät (one-time, nicht übertragbar)
- Lizenzlaufzeiten: 30 Tage / 365 Tage
- Hardblock Mobile Capture wenn `validUntil` null oder `now > validUntil`
- Pakete = Credits (Types: LICENSE_30D, LICENSE_365D, DEVICE_SLOT)
- Credits verfallen nach 12 Monaten (default) → betrifft nur unbenutzte Credits; aktivierte Lizenz bleibt bis validUntil

---

## DB (MVP)

### A) Entitlement (aktueller Zustand je Tenant)

TenantEntitlement
- tenantId (unique)
- validUntil (DateTime, nullable; null = inaktiv)
- maxDevices (int, default 1)
- updatedAt

### B) Credits

TenantCreditBalance (lean, performant)
- tenantId
- type (enum: LICENSE_30D | LICENSE_365D | DEVICE_SLOT)
- quantity (int)
- expiresAt (DateTime)
- unique (tenantId, type, expiresAt) → FIFO/Expiry sauber

Optional (Audit, MVP-lean): TenantCreditLedger
- tenantId, type, delta (+/-)
- reason enum: COUPON_REDEEM | CREDIT_CONSUME | MANUAL_ADJUST
- refId? (promoCodeId/deviceId)
- createdAt

### C) Coupons

PromoCode
- code (unique, normalized uppercase)
- active boolean
- validFrom?, validUntil?
- maxRedemptions default 1
- redeemedCount default 0
- grantLicense30d/grantLicense365d/grantDeviceSlots
- creditExpiresInDays default 365
- partner? string

PromoRedemption
- promoCodeId
- tenantId
- redeemedAt
- redeemedByUserId?

---

## API Standards

- jsonOk/jsonError (traceId im Body + x-trace-id Header)
- Validation via Zod + validateBody/validateQuery
- Tenant leak-safe: falscher Tenant/ID → 404 NOT_FOUND

---

## APIs (Admin)

### Devices
1) GET /api/admin/v1/devices?q=&status=&sort=&dir=
2) GET /api/admin/v1/devices/:id
3) PATCH /api/admin/v1/devices/:id { name?: string|null, setActiveEventId?: string|null }
4) POST /api/admin/v1/devices/:id/revoke
5) POST /api/admin/v1/devices/provision-tokens { expiresInMinutes? } → Gate: activeDevices < maxDevices
6) POST /api/admin/v1/devices/provision-tokens/send-email { email, expiresInMinutes?, message? }

### Billing/Credits
7) GET /api/admin/v1/billing/overview
8) POST /api/admin/v1/billing/redeem { code }
9) POST /api/admin/v1/billing/consume { action }

Errors:
- INVALID_CODE, CODE_EXPIRED, CODE_LIMIT_REACHED
- NO_CREDITS, CREDITS_EXPIRED
- DEVICE_LIMIT_REACHED (402)

---

## APIs (Mobile)

10) GET /api/mobile/v1/billing/status
11) POST /api/mobile/v1/billing/redeem-and-activate { code }

Hardblock (Capture only): forms list, lead create, attachment/ocr upload  
HTTP 402 code=PAYMENT_REQUIRED message="Deine Messe-Lizenz ist abgelaufen. Bitte verlängern." details={ validUntil }

---

## UI (Admin)

### /admin/devices
- Header: "Geräte" + Meta "activeDevices/maxDevices"
- Primary CTA: "Gerät verbinden" → Modal (QR/Token + E-Mail)
- Table Finder-like, Drawer für Details (Name, Status, Event-Bind, Revoke)

### /admin/billing
- Statuskarte: aktiv/inaktiv, gültig bis
- Buttons: 30 Tage aktivieren, 365 Tage aktivieren, +1 Gerät hinzufügen (consume)
- Gutschein einlösen (Input)
- Credits Übersicht (type/quantity/expiresAt) + Hinweis "läuft bald ab" (<=30 Tage)

---

## UI (Mobile)

Bei 402 PAYMENT_REQUIRED:
- Block Screen "Lizenz abgelaufen"
- Button "Lizenz verlängern"
- Gutscheincode Eingabe → redeem-and-activate → Reload → Capture wieder möglich

---

## Tests/Proof (Pflicht)

Commands:
- npm run typecheck
- npm run lint
- npm run build

API Proof (curl):
- Admin redeem coupon → credits erscheinen
- Admin consume license credit → validUntil verlängert
- Admin consume device slot → maxDevices erhöht
- Admin provision token: unter Limit ok; bei Limit 402 DEVICE_LIMIT_REACHED
- Mobile status shows active/expired
- Mobile redeem-and-activate verlängert validUntil
- Capture endpoints blocken wenn abgelaufen, funktionieren wenn aktiv

UI Smoke:
- /admin/billing: Gutschein → Credits sichtbar → 30 Tage aktivieren → validUntil gesetzt
- /admin/devices: Gerät verbinden → QR+Token sichtbar → E-Mail senden
- App: blocked → Gutschein → ok

---

## Offene Punkte (Repo-abhängig)

Für vollständige Umsetzung ohne Snippets müssen bestehende Dateien angepasst werden:
- Prisma schema.prisma Integration (Additions in Repo einfügen, Migration erzeugen)
- Mobile Capture Routen: Entitlement-Guard (402 PAYMENT_REQUIRED)
- Admin Sidebar Nav: Links auf /admin/devices und /admin/billing
- Mobile Screens (Forms/Capture): 402 Handling → License Screen

Diese Files werden nachgeliefert, sobald die aktuellen Dateien gepostet sind (siehe Chat).
