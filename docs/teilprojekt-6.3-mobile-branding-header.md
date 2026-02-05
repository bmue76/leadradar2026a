# Teilprojekt 6.3: Mobile — Branding Header (Tenant links + Logo rechts)

Datum: 2026-02-03  
Status: IN PROGRESS

## Ziel
Auf allen Mobile Screens (via ScreenScaffold) soll oben ein einheitlicher Branding-Header erscheinen:
- Tenant Firmenname links
- Tenant Logo rechts (ohne Rahmen)
- Screen Title bleibt sichtbar (secondary)
ONLINE-only, tenant-scoped, ohne Offline/Sync.

## Umsetzung (Highlights)
- `useTenantBranding` Hook:
  - Lädt Branding via `/api/mobile/v1/branding` mit API-Key.
  - Cacht Branding JSON (TTL) über `src/lib/brandingCache`.
  - Lädt Logo über `/api/mobile/v1/branding/logo` als Data-URI (RN Image kompatibel) und cached es in-memory.
  - Fallback: wenn nicht provisioned → neutraler Header (LeadRadar, kein Logo).
- `ScreenScaffold`:
  - Rendert oben TenantName + Logo konsistent.
  - Kein Rahmen, Logo größer, Title bleibt als secondary Line.

## Dateien/Änderungen
- `apps/mobile/src/ui/useTenantBranding.ts` (neu)
- `apps/mobile/src/ui/ScreenScaffold.tsx` (update)
- `docs/teilprojekt-6.3-mobile-branding-header.md` (neu)

## Akzeptanzkriterien
- Alle Screens mit `ScreenScaffold` zeigen TenantName links + Logo rechts (wenn vorhanden).
- Kein Provisioning → Header fällt auf LeadRadar zurück, ohne Crash.
- DoD: typecheck/lint/build grün.

## Tests/Proof
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Mobile Smoke:
  - App öffnen (provisioned) → Header zeigt TenantName + Logo
  - Tabs wechseln → Header bleibt konsistent
  - Branding/Logo im Admin ändern → App reload → Header aktualisiert (Cache TTL beachten)

## Offene Punkte / Risiken
- Logo Data-URI ist bewusst in-memory cached (TTL). Bei sehr vielen Tenants/Logos später evtl. persistenter Cache nötig.
- AccentColor wird noch nicht live in UI Tokens übernommen (separates TP möglich).

## Next Step
- TP 6.4: Optional — Mobile AccentColor live anwenden (Context/Provider + UI tokens), inkl. Safe Defaults.
