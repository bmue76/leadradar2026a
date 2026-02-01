# Schlussrapport — Teilprojekt 5.5: Billing — SKUs (Preisstufen) + Stripe Packages + Admin UI Fix (Credits oben)

Datum: 2026-01-31
Status: DONE ✅
Commit(s):

33f2636 — feat(tp5.5): Stripe Packages + Billing SKUs + Checkout/Webhook + Admin Billing UI

17ca766 — docs(tp5.5): Admin UI Layout Rule + Preisstaffelung + Schlussrapport

124b64c — fix(tp5.5): fehlende Stripe-Routen/Packages UI+API, Migration + Deps nachgezogen

Ziel

Lizenz-Credits als One-time Purchase via Stripe Packages kaufbar machen.

Preisstaffelung als Pakete abbilden (z.B. 10× günstiger als 10× Einzellizenz).

Im Admin Billing Screen:

Credits sichtbar oben (nicht erst am Seitenende).

Layout exakt wie /admin (Wrapper mx-auto ... max-w-5xl px-6 py-6).

Umsetzung / Änderungen (Highlights)
Stripe / Pricing

Stripe Products/Prices für Lizenz-Credits angelegt:

30 Tage: 1× / 3× / 5× / 10×

365 Tage: 1× / 3× / 5× / 10×

Preisstaffel eingeführt (z.B. 10× 30d günstiger als 10× 1×30d).

DB: BillingSku Seed (stabile IDs)

Seed-Skript erweitert/gebaut, um SKUs id-stabil zu upserten und Duplikate (name/stripePriceId) aufzuräumen.

stripePriceId wird im Update mitgeführt (Preis/Stripe-Preis kann geändert werden ohne Row zu löschen).

Admin UI (Billing)

Credits-Übersicht nach oben gezogen:

Lizenzstatus Card enthält “Verfügbare Credits” als Chips (Summary).

Credits-Tabelle direkt unter Lizenzstatus (FIFO nach Verfall).

Page Layout konsistent zu /admin:

Wrapper mx-auto w-full max-w-5xl px-6 py-6

Header im page.tsx, Client ohne outer padding.

Dateien / Änderungen

tools/seed/billing-skus-seed.mjs — Seed/Upsert der SKUs (inkl. Cleanup Duplikate)

src/app/(admin)/admin/billing/page.tsx — Page Wrapper wie /admin

src/app/(admin)/admin/billing/BillingScreenClient.tsx — UI Reihenfolge/Content

docs/LeadRadar2026A/04_ADMIN_UI.md — Layout-Regel + Billing Screen Spec ergänzt

(zusätzlich im Commit enthalten: Stripe Routes/Webhook/Migration/Deps gem. 124b64c)

Akzeptanzkriterien – Check

 GET /api/admin/v1/billing/packages liefert alle aktiven Pakete inkl. korrekter stripePriceId und amountCents.

 Checkout startet mit POST /api/admin/v1/billing/checkout { skuId } und liefert Stripe Checkout URL.

 Nach erfolgreichem Checkout verarbeitet Webhook Event(s) und schreibt Credits gut.

 Billing Screen zeigt Credits oben (Summary + Tabelle).

 Billing Page Layout entspricht /admin (Padding/Max-Width identisch).

Tests/Proof (reproduzierbar)
Commands
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build

API Smoke

Cookie-Name je nach Setup: lr_session (oder eure aktuelle Session-Cookie-Bezeichnung).

curl -i -H "cookie: lr_session=DEIN_TOKEN" \
  "$BASE/api/admin/v1/billing/packages?ts=$(date +%s)"

curl -i -H "cookie: lr_session=DEIN_TOKEN" \
  "$BASE/api/admin/v1/billing/overview?ts=$(date +%s)"

UI Smoke

/admin/billing → Credits sichtbar oben + konsistentes Padding (wie /admin)

“Pakete kaufen” → Checkout → nach Kauf Credits erhöht

Offene Punkte / Next

P1: “Sparen”-Label/Badge in Paket-Kacheln (Staffelpreis kommunizieren).

P1: Separate SKU-Kategorien/Filter in der UI (30d/365d Tabs).
P2: Orders/Receipts/Invoices (Phase 2) im Billing-Bereich.
