# Teilprojekt 8.1 — /admin Premium SaaS Redesign: Event Übersicht

**Status:** DONE  
**Datum:** 2026-02-24  
**Commit(s):** 89d1dfc

## Ziel
Redesign der Seite `/admin` zur **Event Übersicht** (operatives Cockpit eines laufenden Events).
Kein Admin-Panel, kein Setup-Wizard, kein KPI-Monster. Pro Screen exakt **1 Primary Action**.

## Umsetzung (Highlights)
- Neuer `/admin` Screen als Event Command Center Struktur:
  - Hero: Event Name, Status (LIVE/BEREIT/KEIN), Leads heute, Summary (Geräte/Formulare/Letzte Aktivität) + **1 Primary CTA**
  - Performance Snapshot: Leads heute, Mit Visitenkarte, Exporte + ruhiger Mini-Traffic (Leads pro Stunde)
  - Aktivität: Finder-Style, klickbare Rows (Lead/Gerät/Export)
- Edge States A/B/C:
  - A: kein aktives Event → CTA “Event erstellen”
  - B: Event aktiv, keine Geräte aktiv → CTA “Gerät verbinden”
  - C: Event läuft → CTA “Event öffnen”
- Tenant Context (DEV): Middleware injiziert `x-tenant-slug` für /admin Requests.

## Dateien/Änderungen
- `middleware.ts`
- `src/app/(admin)/admin/page.tsx`
- `src/app/(admin)/admin/_components/*`
- `src/app/(admin)/admin/_lib/commandCenterData.ts`
- `docs/LeadRadar2026A/04_ADMIN_UI.md`
- `src/app/api/admin/v1/forms/route.ts` (lint cleanup)

## Akzeptanzkriterien – Check
- [x] 1 Primary Action
- [x] Dominante Hauptinfo (Event + Leads heute)
- [x] Keine Status-Chip-Orgie / keine Quick-Action-Wolke / keine Checkliste
- [x] Farbe nur funktional
- [x] System spricht nur bei Problemen

## Tests/Proof
- [x] npm run lint
- [x] npm run typecheck
- [x] npm run build
- [x] UI getestet: States A/B/C

## Offene Punkte/Risiken
- P1: DEV Tenant Bootstrap via `DEV_TENANT_SLUG` (Default: atlex). Prod unverändert.

## Next Step
TP 8.2: Feinschliff (Microcopy/Empty States/optional Mockup) oder “Event öffnen” Detail-Screen.
