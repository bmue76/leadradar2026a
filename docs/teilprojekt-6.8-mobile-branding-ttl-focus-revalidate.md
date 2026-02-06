# Schlussrapport — Teilprojekt 6.8: Mobile Branding — TTL + Focus Revalidate + Logo Version Hint (GoLive MVP)

Status: DONE ✅  
Datum: 2026-02-06  
Branch: main  
Commit(s):
- 9c0669d — feat(tp6.8): mobile branding ttl + focus revalidate + logo version hint
- b4010b8 — fix(tp6.8): add async-storage dep for branding cache + doc/index

## Ziel

Mobile App soll Branding **stabil, schnell und zuverlässig** darstellen:

- **Fast paint** via lokalem Cache (Tenant Name / Accent / Logo DataUri)
- **Revalidate** im Hintergrund mit TTL
- **Auto-Refresh bei App-Fokus** (zurück in App → Branding wird aktualisiert)
- **Logo Cache-Busting** via `versionHint` (Logo-Update wird sofort übernommen)
- Keine UI-Flickers / unnötige Requests

## Umsetzung

### 1) Branding Cache (AsyncStorage)
- `apps/mobile/src/lib/brandingCache.ts`
  - Persistenter Cache für `{ tenantName, accentColor, logoDataUri, updatedAt, logoUpdatedAt }`
  - TTL-Logik: „stale-while-revalidate“ (UI darf cached anzeigen, während im Hintergrund refreshed wird)

### 2) Zentrales Branding Hook/Provider
- `apps/mobile/src/ui/useTenantBranding.tsx`
  - Start: Cache lesen → UI sofort „ready“
  - Danach: Branding via API nachladen (nur wenn TTL abgelaufen / Refresh erzwungen)
  - Focus-Revalidate: bei Rückkehr in App wird Branding (falls nötig) aktualisiert (rate-limited)
  - Logo: Download als DataUri via `fetchMobileLogoDataUri({ versionHint })`

### 3) Konsistenter Header
- `apps/mobile/src/ui/ScreenScaffold.tsx`
  - Header zeigt TenantName prominent + Screen Title sekundär
  - Logo rechts (größer, ohne Rahmen), Placeholder wenn keines vorhanden

### 4) Praxis-Fix aus der Verifikation (Provision QR)
Während der End-to-End Verifikation (Android Device Run) wurde ein Provision-QR Edge Case entdeckt und behoben:
- Ursache: **Token/Hash/Format-Mismatch** zwischen erzeugtem Token und Claim/Parsing
- Effekt: Scanner lieferte „Token fehlt“ bzw. Claim gab „ungültig/abgelaufen/verwendet“
- Resultat: **Provisioning per QR funktioniert zuverlässig** (Token wird korrekt übernommen und akzeptiert)

## Abnahme / Smoke Tests

Repo root:
```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build
Mobile (Android):

cd apps/mobile
npx expo start -c
npx expo run:android --device
Checks:

App cold start → Branding erscheint sofort (Cache)

App in Background → wieder öffnen → Branding revalidiert (Focus)

Branding/Logo im Admin ändern → App übernimmt (Logo via versionHint)

Hinweise (Dev-Setup Android)
Für expo run:android wird Java >= 17 benötigt.

Lösung (Windows): apps/mobile/android/gradle.properties muss ein korrektes org.gradle.java.home=... auf ein JDK >= 17 zeigen (Android Studio jbr ist ok).

Ergebnis
Mobile Branding wirkt „produktionsreif“ (ruhig, schnell, robust).

Cache + TTL + Focus-Revalidate reduzieren API-Last und vermeiden UI-Flackern.

Logo Updates werden zuverlässig erkannt.

Provision-QR Flow ist im Real-Device-Test validiert.

Next Step
TP 6.9: Devices — Admin Device-Management + Slots/Limit UX (GoLive MVP)
