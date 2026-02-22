# Teilprojekt 7.8 — Device Onboarding + Stripe Cleanup + Lizenzen/Historie

Status: IN_ARBEIT / READY_FOR_COMMIT  
Datum: 2026-02-22

## Ziel
- Stripe GoLive-MVP: nur 2 Device-Lizenztypen (30/365), Checkout + Webhook → DeviceLicense (History).
- Device Onboarding: Provisioning Token (12h) → QR/Textcode → E-Mail Versand → Redeem → ApiKey.
- Admin: Geräte (Cards) + Drawer „Gerät einrichten“ + /admin/licenses (Übersicht + Historie).

## Umsetzung (Highlights)
- Stripe Checkout: 2 Prices via ENV (`STRIPE_PRICE_DEVICE_FAIR_30D`, `STRIPE_PRICE_DEVICE_YEAR_365D`)
- Stripe Webhook: `checkout.session.completed` → DeviceLicense create/extend, StripeEvent idempotent
- Provisioning: Create/Resend/Rotate (12h) inkl. Mail mit QR inline + Copy-Link
- Admin UI: Geräte Cards + klarer Lizenzstatus + Drawer UX; Lizenzen-Historie Screen

## Dateien/Änderungen (Auszug)
- prisma/schema.prisma + migrations (TP7.5–TP7.8 pending)
- src/app/api/webhooks/stripe/route.ts
- src/app/api/admin/v1/devices/** (license + provisioning)
- src/app/api/admin/v1/licenses/route.ts
- src/app/api/mobile/v1/provisioning/redeem + /license
- src/app/(admin)/admin/devices/** + /admin/licenses/**
- src/lib/mailer.ts
- docs/LeadRadar2026A/{02_DB,03_API,04_RUNBOOK,05_RELEASE_TESTS}.md

## Akzeptanzkriterien – Check
- [ ] npm run typecheck → 0 Errors
- [ ] npm run lint → 0 Errors (Warnings ok)
- [ ] npm run build → grün
- [ ] Stripe Checkout URL kommt
- [ ] Webhook schreibt DeviceLicense (lokal via stripe listen)
- [ ] Provisioning Token erzeugen + Resend E-Mail OK
- [ ] /admin/licenses zeigt Status + Historie

## Tests/Proof (reproduzierbar)
- `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
- Checkout durchführen (30/365) → DeviceLicense sichtbar
- Provisioning resend → Mail kommt an (QR/Copy)
- Redeem → apiKey, danach `/api/mobile/v1/license`

## Offene Punkte/Risiken
- Lokal: Webhook nur mit `stripe listen` (Runbook dokumentiert).
- Pending-Aktivierung: Startzeitpunkt = erster App-/license-call (Mobile TP folgt).

## Next Step
- Commit/Push + Schlussrapport finalisieren (Hashes eintragen).
- Danach TP 7.9 Mobile App Onboarding + License Gate.
