# Schlussrapport — Teilprojekt 5.4: Betrieb – Devices + Billing + Credits/Coupons + Hardblock (MVP)

Datum: 2026-01-30  
Status: DONE ✅  
Git: 5ddf631  
Fix (QR Route TS-safe PNG Body): 30ef31e

## Ziel
Betriebsfähige Basis für:
- Geräteverwaltung (Admin) inkl. Plattform-Transparenz und Sperr-/Status-Mechanik.
- Billing-Übersicht (Admin) für Lizenzstatus, Device-Slots und Credit-Balances.
- Gutscheine (Promo Codes) einlösen → Credits gutschreiben (mit Verfall) + Ledger-Audit.
- Credits konsumieren → Lizenz aktivieren (30/365) oder Device Slot erhöhen.
- Hardblock: Mobile darf nur arbeiten, wenn Lizenz aktiv ist (MVP-Regel).

## Umsetzung / Änderungen (High Level)
### Admin
- Neue Admin-Seiten **/admin/devices** und **/admin/billing**
- Page Styling konsistent zu **/admin** (max-w, px/py, Header-Pattern, Cards)

### Backend / Billing Core
- Billing Service (Overview, Redeem, Consume, Status)
- Datenmodell für Entitlements + Credits + Promo Codes + Redemptions + Ledger
- Transaktionen & Guards: maxRedemptions, validity windows, atomic updateMany, Expiry Handling
- Credit-Verbrauch FIFO nach nächstem Verfall (expiresAt asc)

### Mobile
- Lizenz-Status abrufen + Aktivierung via Gutschein (Mobile Flow)
- Hardblock Verhalten im API-Flow (nur aktiv => normaler Betrieb)

### Platform
- QR PNG Route TS-safe Body-Handling

## Deliverables
- Admin UI: Devices + Billing (MVP)
- APIs: Admin Billing/Devices + Mobile Billing
- Prisma Migration Billing/Credits
- Docs: TP 5.4 Schlussrapport + (falls enthalten) TP 5.3 Doc Update

## Akzeptanzkriterien (MVP)
- Admin kann Billing Overview laden (Lizenzstatus, aktive/max Geräte, Credits, expiringSoon)
- Admin kann Coupon einlösen → Credits erscheinen + Ledger-Eintrag
- Admin kann Credits konsumieren → Lizenz verlängern oder Device Slot erhöhen
- Mobile wird bei inaktiver Lizenz sauber blockiert / geführt (kein “silent fail”)
- UI Pages haben identisches Spacing wie /admin (max-w + Header + Cards)

## Proof
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run build` ✅
- Manual Smoke: Billing Overview / Redeem / Consume / Devices / Mobile Status ✅

## Offene Punkte / Next
- UI Feinschliff: Action-Buttons (busy states), kleine Copy-Details, ggf. Ledger-View (optional)
- Packages/Stripe Verknüpfung (Abo → entitlement.validUntil) als nächster Schritt
- Device-Plattform optional erweitern (OS-Version/Model) wenn Support es verlangt
