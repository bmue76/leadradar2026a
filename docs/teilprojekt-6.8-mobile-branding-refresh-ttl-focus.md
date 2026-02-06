# Schlussrapport — Teilprojekt 6.8: Mobile Branding Refresh (TTL + Focus Revalidate) + Logo Versioning

Status: DONE ✅  
Datum: 2026-02-06

## Ziel

Mobile Branding (Tenant Name / Accent / Logo) soll robust & performant sein:

- Schneller First Paint via Cache (AsyncStorage)
- Stale-while-revalidate: Cache anzeigen, im Hintergrund aktualisieren
- Refresh bei Screen-Focus, aber rate-limited (kein Spam)
- Logo nur neu laden, wenn `logoUpdatedAt` sich ändert (Version-Hint)

## Umsetzung

### Cache Schema erweitert
- Cache enthält neu: `logoUpdatedAt` als Version-Hint
- `updatedAt` bleibt als Cache-Schreibzeitpunkt

### Revalidate Policy
- TTL: 24h
- Focus refresh: nur wenn
  - Cache fehlt **oder**
  - Cache stale **oder**
  - letzter Revalidate > 10 Minuten **oder**
  - `force: true`

### Logo Fetch Optimierung
- Logo wird nur gefetched, wenn
  - kein cached logo vorhanden **oder**
  - `logoUpdatedAt` sich geändert hat
- Falls Logo-Fetch fehlschlägt: cached Logo bleibt (best effort)

## Akzeptanzkriterien

- [x] App startet mit cached Branding (falls vorhanden)
- [x] Branding wird beim Aktivieren eines Screens revalidiert (rate-limited)
- [x] Logo wird nicht bei jedem Refresh neu geladen (nur bei Version Change)
- [x] Bei API-Fehlern bleibt cached Branding sichtbar (kein harter Error, wenn Cache vorhanden)
- [x] typecheck / lint / build grün

## Smoke Tests

1) Mobile starten (Provisioned) → Tenant Name/Logo sofort sichtbar (Cache)  
2) Admin → Branding ändern (Name/Accent/Logo) → Mobile Tab wechseln → Branding aktualisiert (spätestens nach Focus-Revalidate)  
3) Offline schalten → App öffnen → cached Branding bleibt sichtbar  
4) Logo unverändert lassen → mehrfach Tab wechseln → kein unnötiges Logo-Re-Fetch (visuell stabil)

## Relevante Files

- `apps/mobile/src/lib/brandingCache.ts`
- `apps/mobile/src/ui/useTenantBranding.tsx`
- `apps/mobile/src/ui/ScreenScaffold.tsx`

## Commits

- TODO: (nach dem Commit hier eintragen)
