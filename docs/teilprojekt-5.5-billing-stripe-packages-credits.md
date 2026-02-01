# Schlussrapport — Teilprojekt 5.5: Billing → Stripe Packages (Credits kaufen) + Webhook Gutschrift + Admin UI “Kaufen”

Datum: 2026-01-30  
Status: READY (nach Commit/Push) ✅  
Scope: ONLINE-only (GoLive MVP)

## Ziel

- Credit-Pakete (3/5/10 etc.) via Stripe als One-time Payments verkaufen.
- Webhook schreibt Credits tenant-scoped gut (idempotent + auditierbar).
- Admin kann nach Kauf Credits in Billing Overview sehen (TP5.4).
- Kein Auto-Activate (MVP): Kauf = Credits, Aktivierung bleibt Admin-Action (bestehender Flow).

## Umsetzung (Highlights)

### DB (Prisma)
- Neues Mapping-Modell `BillingSku` (stripePriceId → Grants, expiresInDays, sortOrder).
- `BillingOrder` für Checkout Session Audit + Idempotenz via `creditsGrantedAt`.
- `StripeEvent` Event Log (RECEIVED/PROCESSED/IGNORED/FAILED).
- Ledger ergänzt um `TenantCreditLedgerReason.STRIPE_PURCHASE`.

### API
- `GET /api/admin/v1/billing/packages` listet aktive SKUs sortiert.
- `POST /api/admin/v1/billing/checkout` erstellt Stripe Checkout Session + `BillingOrder(PENDING)`; metadata: tenantId/skuId/userId.
- `POST /api/webhooks/stripe`:
  - Signature Verify (STRIPE_WEBHOOK_SECRET)
  - Idempotenz: `creditsGrantedAt` verhindert Double-Grant bei Retries
  - Credits: upsert `TenantCreditBalance` pro type/expiresAt + Ledger `STRIPE_PURCHASE` refId=checkoutSessionId

### UI
- Neuer Screen `/admin/billing/packages`: Cards mit SKU + “Kaufen”.
- Checkout URL redirect aus Admin API.

## Dateien/Änderungen

- prisma/schema.prisma
- src/lib/stripe.ts
- src/app/api/admin/v1/billing/packages/route.ts
- src/app/api/admin/v1/billing/checkout/route.ts
- src/app/api/webhooks/stripe/route.ts
- src/app/(admin)/admin/billing/packages/page.tsx
- src/app/(admin)/admin/billing/packages/PackagesScreenClient.tsx
- docs/teilprojekt-5.5-billing-stripe-packages-credits.md

## Akzeptanzkriterien – Check

- [x] Packages sichtbar (SKU aus DB, sortiert, active=true)
- [x] “Kaufen” öffnet Stripe Checkout
- [x] Webhook gutschreibt Credits (balances + ledger) tenant-scoped
- [x] Idempotent bei Stripe Retries (creditsGrantedAt)
- [x] No secrets in Git (nur .env.local)

## Tests/Proof (reproduzierbar)

### 1) Migration + Build Checks

```bash
cd /d/dev/leadradar2026a

npx prisma migrate dev -n "tp5_5_stripe_packages"
npm run typecheck
npm run lint
npm run build
2) Stripe CLI Webhook Forwarding
.env.local:

STRIPE_SECRET_KEY=...

STRIPE_WEBHOOK_SECRET=...

bash
Code kopieren
stripe listen --forward-to localhost:3000/api/webhooks/stripe
3) SKU Setup (einmalig)
Stripe Dashboard: Produkt/Price erstellen (one-time).

In DB BillingSku anlegen:

stripePriceId = price_...

grants (z.B. grantLicense30d=3)

creditExpiresInDays=365

active=true

4) Checkout erzeugen (Admin Cookie)
bash
Code kopieren
curl -i -X POST \
  -H "cookie: lr_session=DEIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"skuId":"SKU_ID"}' \
  "http://localhost:3000/api/admin/v1/billing/checkout"
checkoutUrl öffnen → Testzahlung → Stripe CLI zeigt checkout.session.completed.

5) Credits prüfen (Overview)
bash
Code kopieren
curl -i \
  -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/billing/overview"
Erwartung: Credits erhöht, Ledger Einträge vorhanden (STRIPE_PURCHASE, refId=sessionId).

6) UI Smoke
/admin/billing/packages → Pakete sichtbar

“Kaufen” → Stripe Checkout

Zahlung → Webhook → Credits in Billing Overview sichtbar (nach Refresh)

Offene Punkte / Risiken
P1: Toast in /admin/billing?checkout=success|cancel muss im bestehenden Billing Screen ergänzt werden (separate Datei nicht im Scope geliefert).

P1: Pflege UI/Link in Sidebar zu “Pakete” (falls gewünscht).

Next Step
TP 5.6: Billing UI polish (Pakete Section direkt in /admin/billing integrieren + Toast + Link/Tab)
