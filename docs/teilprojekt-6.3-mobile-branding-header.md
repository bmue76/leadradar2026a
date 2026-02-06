# Schlussrapport — Teilprojekt 6.3: Mobile → Branding Header (Tenant links + Logo rechts) + Branding Cache — ONLINE-only

Status: DONE ✅  
Datum: 2026-02-05  
Branch: main  
Commit(s):
- 11b3173 — feat(tp6.3): mobile tenant header (name left, logo right) + branding cache

## Ziel

Mobile App erhält konsistentes Tenant-Branding im Header (ohne Schulungsbedarf):

- Tenant-Company links prominent
- Logo rechts (ohne Rahmen)
- AccentColor als UI-Token nutzbar (z. B. CTA)
- Branding wird gecached (schneller Start, weniger Calls)

## Umsetzung (Highlights)

- Zentraler Branding-Header im ScreenScaffold (Tenant links, Logo rechts).
- useTenantBranding kapselt Branding-Fetch + Cache + Logo-DataUri (auth-protected).
- Home (app/index.tsx) entfernt redundante Branding-Row und nutzt AccentColor für „Lead erfassen“-CTA.
- Lint-Cleanup im Admin (AdminAccentProvider): unnötigen React-Import entfernt.

## Dateien/Änderungen

- apps/mobile/src/ui/ScreenScaffold.tsx
- apps/mobile/src/ui/useTenantBranding.tsx
- apps/mobile/src/lib/branding.ts
- apps/mobile/src/lib/brandingCache.ts
- apps/mobile/app/index.tsx
- apps/mobile/app/_layout.tsx
- src/app/(admin)/admin/_components/AdminAccentProvider.tsx
- docs/teilprojekt-6.3-mobile-branding-header.md
- docs/LeadRadar2026A/00_INDEX.md

## Akzeptanzkriterien — Check ✅

- ✅ Tenant-Name links / Logo rechts im Mobile-Header sichtbar
- ✅ AccentColor wird als Token genutzt (CTA)
- ✅ Branding wird geladen & gecached
- ✅ Repo clean, Commit gepusht (11b3173)

## Tests/Proof (reproduzierbar)

```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build
Mobile Smoke:

App starten → Header zeigt Tenant-Name + Logo

Home CTA nutzt AccentColor

Reload → Branding aus Cache sichtbar, danach aktualisiert

Offene Punkte/Risiken
P1: Langfristig Single Source of Truth: ggf. noch existierende Brückenpfade/Legacy-Imports entfernen, sobald keine abhängigen Imports mehr bestehen.

Next Step
TP 6.4: Branding UI Polish (Hydration-safe Logo + ETag Bust + Upload Types)
