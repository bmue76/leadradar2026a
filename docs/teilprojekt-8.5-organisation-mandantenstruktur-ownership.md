# Teilprojekt 8.5 — Organisation (Mandantenstruktur & Ownership)
Status: DONE
Datum: 2026-02-27

## Commit(s)
- <COMMIT_HASH_1>
- <COMMIT_HASH_2>

## Ziel
Implementierung eines klar strukturierten Organisationsbereichs (Hub + Mandant + Transfer-Teaser),
als zentraler Plattformbereich in der Hauptnavigation. Footer enthält nur noch „Abmelden“.

## Umsetzung (Highlights)
- Organisation als eigener Hauptnavi-Punkt (Übersicht / Mandant / Mandant übertragen).
- Read-only Transparenz: Mandantenname, Slug, Owner (Name/E-Mail), erstellt am.
- Read-only Aggregation: Anzahl aktiver Lizenzen.
- Transfer als Beta-Scaffold (kein echter Flow, aber saubere Struktur + Teaser/CTA).
- Footer bereinigt: ausschließlich Abmelden (keine Doppelung mit Organisation).
- Original AdminShell/Sidebar Design wiederhergestellt (Topbar inkl. TenantTopbarBranding/Logo).

## Dateien/Änderungen
- src/app/api/admin/v1/organisation/_repo.ts
- src/app/api/admin/v1/organisation/route.ts
- src/app/(admin)/admin/organisation/page.tsx
- src/app/(admin)/admin/organisation/OrganisationHubClient.tsx
- src/app/(admin)/admin/organisation/mandant/page.tsx
- src/app/(admin)/admin/organisation/mandant/MandantClient.tsx
- src/app/(admin)/admin/organisation/transfer/page.tsx
- src/app/(admin)/admin/_components/AdminShell.tsx
- src/app/(admin)/admin/_components/SidebarNav.tsx
- docs/LeadRadar2026A/04_ADMIN_UI.md
- docs/teilprojekt-8.5-organisation-mandantenstruktur-ownership.md

## Akzeptanzkriterien – Check
- [x] Organisation in Hauptnavigation integriert
- [x] Footer enthält nur noch „Abmelden“
- [x] Routen implementiert
- [x] Keine Doppelung mit „Firma & Belege“
- [x] Keine DB-Migration
- [x] npm run typecheck → 0 Errors
- [x] npm run lint → 0 Errors
- [x] npm run build → grün
- [x] Docs aktualisiert
- [x] Schlussrapport erstellt

## Tests/Proof (reproduzierbar)
### API
- curl -sS http://localhost:3000/api/admin/v1/organisation | jq
Erwartung: ok:true, tenant/owner Felder vorhanden, activeLicensesCount number, x-trace-id Header gesetzt.

### UI Smoke
- /admin/organisation: Hub lädt (Mandant-Karte + Transfer Beta)
- CTA „Details anzeigen“ → /admin/organisation/mandant (read-only, Hinweis zu Abrechnung sichtbar)
- CTA „Mehr erfahren“ → /admin/organisation/transfer (Teaser + Vormerken CTA)
- Sidebar: Organisation als Hauptpunkt sichtbar, Footer: nur Abmelden
- Topbar: TenantTopbarBranding inkl. Tenant-Logo sichtbar

## Offene Punkte/Risiken
- P1: Transfer ist bewusst Scaffold (echter Flow folgt später, Rollen/Owner-Transfer).

## Next Step
- TP 8.6 (GoLive-Polish): Copy/Labels finalisieren + kleine Spacing/States Harmonisierung (Organisation Screens).
