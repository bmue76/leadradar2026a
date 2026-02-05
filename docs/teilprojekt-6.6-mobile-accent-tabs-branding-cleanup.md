# Teilprojekt 6.6 — Mobile: AccentColor in Tabs + Branding Cleanup

Status: IN PROGRESS  
Datum: 2026-02-05  
Scope: Mobile (Expo Router) + Cleanup Branding Lib

## Ziel
- Mobile nutzt Tenant Branding zentral:
  - AccentColor steuert Tab Active Tint + Primary CTA (Fallback: UI.accent)
  - Branding Hook/Provider ist Single Source of Truth
- Keine doppelten Branding Libs / Imports

## Umsetzung
- Tabs: `tabBarActiveTintColor` dynamisch aus `useTenantBranding()`
- Root: `BrandingProvider` stellt State bereit
- Cleanup: Entferne `apps/mobile/lib/*`, nutze nur `apps/mobile/src/lib/*`
- Smoke:
  - ohne Branding erreichbar (Fallback)
  - mit Branding: Accent sichtbar

## Acceptance Criteria
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run build` ✅
- Tabs reagieren auf Tenant AccentColor
- Keine doppelten Branding-Dateien / Imports

## Files
- apps/mobile/app/_layout.tsx
- apps/mobile/src/ui/useTenantBranding.ts
- apps/mobile/components/BrandingProvider.tsx
- apps/mobile/src/lib/branding.ts
- apps/mobile/src/lib/brandingCache.ts

