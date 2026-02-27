# Teilprojekt 8.4 — Navigation & Begrifflichkeits-Refactoring (Pre-GoLive Cleanup)

Status: READY FOR COMMIT  
Datum: 2026-02-26

## Ziel

Strukturelle und begriffliche Bereinigung der Admin-Navigation vor GoLive:

- kundenzentriert
- chronologisch logisch
- geschäftsorientiert
- premium-wirkend

**Nicht-Ziele (hard):**
- keine funktionalen Änderungen
- keine Business-Logik-Änderungen
- keine API-Anpassungen
- keine DB-Änderungen
- URLs bleiben unverändert

## Soll-Navigation (IA)

**Übersicht**
- Übersicht (/admin)

**Vorbereitung**
- Vorlagen (/admin/templates)
- Formulare (/admin/forms)
- Branding (/admin/settings/branding)

**Messen**
- Messen & Events (/admin/events)
- Geräte (/admin/devices)

**Leads**
- Leads (/admin/leads)
- Exporte (/admin/exports)

**Auswertung**
- Performance (/admin/statistik)
- Executive Bericht (Beta) (/admin/reports/executive)

**Abrechnung**
- Lizenzübersicht (/admin/licenses)
- Firma & Belege (/admin/billing/accounting)

**Organisation** (sticky)
- Organisation (/admin/settings)

## Begrifflichkeit (verbindlich)

| Alt | Neu |
|---|---|
| Start | Übersicht |
| Setup | Vorbereitung |
| Einsatz | Messen |
| Events | Messen & Events |
| Performance | Performance |
| Reports | Executive Bericht |
| Lizenzen | Abrechnung |
| Einstellungen | Organisation |

## Umsetzung (Highlights)

- Sidebar-IA: neue Gruppierung gemäss Soll-Struktur, ohne URL-/Route-Änderung.
- Labels & Titles konsistent in Sidebar, Sticky-Link und Page-Headern.
- Microcopy-Polish in grossen Screens (Forms/Exports/Leads/Events), nur UI-Text.

## Dateien / Änderungen

- src/app/(admin)/admin/_components/SidebarNav.tsx
- src/app/(admin)/admin/_components/AdminShell.tsx
- src/app/(admin)/admin/licenses/page.tsx
- src/app/(admin)/admin/events/page.tsx
- src/app/(admin)/admin/statistik/page.tsx
- src/app/(admin)/admin/reports/executive/page.tsx
- src/app/(admin)/admin/settings/page.tsx
- (plus UI-Text-Polish in: Forms/Exports/Leads/Events ScreenClient, PerformanceSnapshotToday, AdminHomeOverview)

## Akzeptanzkriterien – Check

- [ ] Begriffe konsistent im gesamten Admin (keine alten Nav-Begriffe sichtbar)
- [ ] Navigation klickbar (keine toten Links)
- [ ] Keine Redirect-Probleme
- [ ] typecheck 0
- [ ] lint 0
- [ ] build grün
- [ ] git clean
- [ ] Commit gepusht, Hash dokumentiert

## Tests / Proof (reproduzierbar)

1) `npm run typecheck`  
2) `npm run lint`  
3) `npm run build`  

UI Smoke:
- /admin → Sidebar zeigt neue Gruppen/Labels
- Vorbereitung → Vorlagen/Formulare/Branding
- Messen → Messen & Events / Geräte
- Leads → Leads / Exporte
- Auswertung → Performance / Executive Bericht (Beta)
- Abrechnung → Lizenzübersicht / Firma & Belege
- Organisation (sticky) → /admin/settings

## Offene Punkte / Risiken

- P1: Falls in einzelnen Sub-Komponenten weiterhin alte Wörter im UI auftauchen, gezielt UI-Text nachziehen (ohne Identifier-/Route-Änderungen).

## Next Step

- Commit + Push
- Schlussrapport inkl. Commit-Hashes ergänzen
