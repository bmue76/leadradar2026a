# Teilprojekt 5.0 — Admin Shell + Navigation Scaffold (de-CH) — ONLINE-only (MVP)

Datum: 2026-01-29  
Status: READY ✅ (nach Commit/Push auf DONE setzen)

## Ziel
Admin Grundstruktur bereitstellen:
- Topbar + Sidebar + Content Scaffold (Apple-clean)
- Sidebar Navigation mit Gruppen & route-aware Active State
- Sticky Einstellungen (unten) + Footer „Powered by LeadRadar“
- de-CH Copy, ONLINE-only, keine echten API Calls (Placeholders)

## Umsetzung (Highlights)
- Admin Layout unter `/admin` via `src/app/(admin)/admin/layout.tsx`
- UI-Placeholders:
  - Tenant: „Atlex GmbH“ (Logo-Platz)
  - User: „Beat“
- Sidebar:
  - Gruppen: Start / Setup / Betrieb / Statistik / Abrechnung
  - Active State: pathname-basiert
  - Sticky bottom: Einstellungen + Powered by

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

alle Sidebar-Items anklicken → Seiten laden ohne Errors

Active State wechselt korrekt

Sticky „Einstellungen“ bleibt unten sichtbar

Dateien/Änderungen
src/app/(admin)/admin/layout.tsx

src/app/(admin)/admin/_components/AdminShell.tsx

src/app/(admin)/admin/_components/SidebarNav.tsx

src/app/(admin)/admin/_components/icons.tsx

src/app/(admin)/admin/_components/AdminPageHeader.tsx

(optional neue Stub-Pages, je nach vorhandenem Stand)

Git
Commit (nach Push eintragen):

TBD
