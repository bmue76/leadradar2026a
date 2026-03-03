# Teilprojekt 9.2 — Mobile Activation Gate (Android zuerst) — QR Scan + Scroll Fix (MVP ONLINE-only)

Titel + Status + Datum + Commit(s)  
Teilprojekt: 9.2 — Mobile Activation Gate — QR Scan + Scroll Fix  
Status: DONE  
Datum: 2026-03-03 (Europe/Zurich)  
Commit(s): f8d0880 (main → origin/main), 14bc03a (main → origin/main)

## Ziel

Activation Screen (Mobile) so verbessern, dass:

- Aktivierungscode kann **manuell** eingegeben werden **oder via QR-Code Scan**
- Screen ist **scrollbar** und **keyboard-safe** (keine „fixierte“ Seite)
- UX bleibt Apple-clean, de-CH Microcopy
- DoD bleibt erfüllt: typecheck/lint grün

## Umsetzung (Highlights)

- Activation UI (`/activate`)
  - ScrollView + KeyboardAvoiding + SafeArea: Screen nicht mehr fixiert
  - QR-Code Scan via `expo-camera`:
    - Permission Flow
    - Fullscreen Scanner Overlay mit visuellem Rahmen
    - QR-Inhalt wird robust geparst:
      - URL mit `?code=` / `?activationCode=` etc. wird unterstützt
      - oder Raw-Code wird übernommen
  - Code kann weiterhin per Clipboard „Einfügen“ gesetzt werden

- Release Tests
  - Mobile Smoke: Activation (TP 9.2) um QR-Scan Step ergänzt

## Dateien/Änderungen

- `apps/mobile/app/activate.tsx`
  - Scroll/Keyboard-safe Layout
  - QR Scanner (expo-camera) integriert
- `apps/mobile/package.json`, `apps/mobile/package-lock.json`
  - `expo-camera` hinzugefügt
- `docs/LeadRadar2026A/05_RELEASE_TESTS.md`
  - Mobile Smoke Activation: QR-Scan Step ergänzt

## Akzeptanzkriterien – Check

- ✅ App startet → Gate → Activation Screen sichtbar (wenn nicht aktiv)
- ✅ QR-Scan vorhanden und übernimmt Code (Permission Flow ok)
- ✅ Screen ist scrollbar (auch mit Keyboard) — kein „fixed“ Layout
- ✅ Aktivierung funktioniert weiterhin (manuell + QR)
- ✅ Code Quality:
  - npm run typecheck → grün
  - npm run lint → grün (Warnings ok)
  - cd apps/mobile && npm run lint → grün
- ✅ Docs aktualisiert
- ✅ git status clean, Commits gepusht

## Tests/Proof (reproduzierbar)

### Dev Client (Native Module)
```bash
cd apps/mobile
npx expo install expo-camera
npx expo run:android
npx expo start --dev-client -c
Manual Smoke (real device, Android)

App starten → Activation Screen

QR-Code scannen → Code wird übernommen

Aktivieren → Redirect /forms

App kill/restart → bleibt aktiv

Fehlerfall: ungültiger Code → Error + Retry (traceId wenn Server reached)

Offene Punkte/Risiken

P1: QR-Formate: falls künftig andere QR-Payloads genutzt werden, Parser in extractCodeFromQr() erweitern.

P1: Permissions: falls OEM-spezifische Kamera-Restriktionen auftreten, UX-Hint ergänzen.

Next Step

TP 9.4 — Mobile Capture/Render (ONLINE-only) auf /forms/[id] finalisieren.
