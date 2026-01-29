# Teilprojekt 5.0 — Admin Shell + Navigation Scaffold (de-CH) — ONLINE-only (MVP)

Datum: 2026-01-29  
Status: DONE ✅

## Ziel
Admin Grundstruktur bereitstellen:
- Topbar + Sidebar + Content Scaffold (Apple-clean)
- Sidebar Navigation mit klaren Hauptkategorien (Icons) + aufklappbaren Unterpunkten
- Sticky Einstellungen (unten) + Footer „Powered by“ (2-zeilig inkl. LeadRadar Logo)
- de-CH Copy, ONLINE-only, keine echten API Calls (Placeholders)

## Umsetzung (Highlights)
- Admin Layout unter `/admin` via `src/app/(admin)/admin/layout.tsx`
- UI-Placeholders:
  - Tenant: „Atlex GmbH“ (Logo-Platz)
  - User: „Beat“
- Sidebar:
  - Hauptkategorien als kompakte Buttons mit Icons (Start/Setup/Betrieb/Leads/Statistik/Abrechnung)
  - Accordion: Klick öffnet die Unterpunkte der Kategorie
  - Active State: route-aware, Kategorie wird beim Routenwechsel automatisch geöffnet
  - Sticky bottom: Einstellungen + Powered by (Logo aus `/public/brand/leadradar-logo.png`)

## Routes / Sitemap (Stand TP 5.0)
Start
- `/admin` — Übersicht

Setup
- `/admin/templates` — Vorlagen
- `/admin/forms` — Formulare
- `/admin/branding` — Branding

Betrieb
- `/admin/events` — Events
- `/admin/devices` — Geräte

Leads
- `/admin/leads` — Leads
- `/admin/recipients` — Empfängerlisten
- `/admin/exports` — Exporte

Statistik
- `/admin/stats` — Statistik

Abrechnung
- `/admin/billing/packages` — Pakete
- `/admin/billing/orders` — Bestellungen
- `/admin/billing/licenses` — Lizenzen

Einstellungen
- `/admin/settings` — Einstellungen
- `/admin/settings/account` — Konto
- `/admin/settings/tenant` — Mandant
- `/admin/settings/users` — Benutzer

## Proof / Commands
```bash
npm run typecheck
npm run lint
npm run build
Manual Smoke:

/admin öffnen

Hauptkategorien klicken → Unterpunkte klappen auf

Seiten laden ohne Errors

Active State korrekt

Sticky „Einstellungen“ sichtbar

Footer „Powered by“ 2-zeilig mit Logo sichtbar

Dateien/Änderungen
src/app/(admin)/admin/layout.tsx

src/app/(admin)/admin/_components/AdminShell.tsx

src/app/(admin)/admin/_components/SidebarNav.tsx

src/app/(admin)/admin/_components/icons.tsx

src/app/(admin)/admin/_components/AdminPageHeader.tsx

docs/LeadRadar2026A/00_INDEX.md

docs/teilprojekt-5.0-admin-shell-navigation-scaffold.md

Git
e6f6053 — feat(tp5.0): admin shell + navigation scaffolding (de-CH)

TBD — feat(tp5.0): sidebar accordion + powered-by logo
