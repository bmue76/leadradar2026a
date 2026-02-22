# Teilprojekt 7.9 — Mobile App Onboarding + License Gate (Flash) + Splash Gate

Status: DONE (GoLive-MVP)  
Datum: 2026-02-22  
Commit(s): 8c9b3a7

## Ziel
- App Start deterministisch (ONLINE-only):
  - kein apiKey → Onboarding
  - apiKey vorhanden → /license prüfen → aktiv → Connected / inaktiv → Flash License Gate
- Onboarding professionell:
  - QR Scan (expo-camera) + Code Eingabe (tenantSlug + Kurzcode)
  - Deep Link Prefill: leadradar://provision?tenant=...&code=...
- License Gate:
  - premium Apple-clean “Flash Screen” mit Accent Glow
  - klare CTAs: „Erneut prüfen“, „Lizenz kaufen“, „Gerät trennen“
  - Debug/TraceId nur in „Details“

## Umsetzung (Highlights)
- **Splash Gate (1.2–1.8s):** ruhiger Apple-clean Startscreen mit subtiler Motion (Fade + minimal Scale), überbrückt License-Check.
- **Secure Storage:** tenantSlug/apiKey/deviceId via expo-secure-store.
- **API Client:** redeemProvisioning + fetchLicense (robust, user-friendly Errors, TraceId).
- **UX:** Cards statt Tabellen, klare Typo, Accent Color nur funktional.

## Dateien/Änderungen
Mobile:
- apps/mobile/app/index.tsx
- apps/mobile/app/provision.tsx
- apps/mobile/app/license.tsx
- apps/mobile/app/stats.tsx
- apps/mobile/app/forms/_layout.tsx
- apps/mobile/src/lib/mobileApi.ts
- apps/mobile/src/lib/mobileConfig.ts
- apps/mobile/src/lib/mobileStorage.ts
- apps/mobile/src/ui/CollapsibleDetails.tsx
- apps/mobile/src/ui/SegmentedControl.tsx
- apps/mobile/src/types/assets.d.ts
- apps/mobile/assets/brand/leadradar-logo.png
- apps/mobile/assets/brand/leadradar-icon.png

Backend:
- middleware.ts (Mobile API Bypass: /api/mobile/* nicht via proxy)

## Akzeptanzkriterien – Check
- [x] App startet deterministisch (kein Flackern / keine Infinite Spinner)
- [x] Ohne apiKey: Onboarding sichtbar (QR + Code)
- [x] Mit apiKey aber isActive=false: Flash Block Screen
- [x] Mit isActive=true: Connected Screen zeigt endsAt/type
- [x] Fehlerhandling user-friendly; TraceId nur in Details
- [x] npm run typecheck → grün
- [x] npm run lint → grün
- [x] npm run build → grün
- [x] git status clean, Commit gepusht

## Tests/Proof (reproduzierbar)
### Backend
- Redeem (Kurzcode):
  - POST /api/mobile/v1/provisioning/redeem { tenantSlug, code } → { apiKey, tenantSlug, deviceId }
- License Gate:
  - GET /api/mobile/v1/license (Header x-api-key) → { isActive, endsAt, type }

### Mobile
- Start: npx expo start --clear
- Flow:
  - Gerät trennen → QR scannen → Redeem → apiKey gespeichert → /license
  - blocked → Flash Screen + Retry
  - active → Connected Screen zeigt type/endsAt

## Offene Punkte/Risiken
- P1: SafeAreaView Deprecation (Migration zu react-native-safe-area-context später)
- P1: „Lizenz kaufen“ öffnet Admin URL nur, wenn EXPO_PUBLIC_ADMIN_URL gesetzt ist (sonst Info-Dialog)

## Next Step
- TP 8.0: Event-/Formular-Model & Mobile Flow Alignment:
  - Event auswählen (Home) → Formular auswählen → Capture
  - Formulare mehrfach über Events nutzbar (global oder Multi-Assign)
