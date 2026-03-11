# Schlussrapport — TP 9.4b Native QR Decode Hardening (iOS + Android)

Titel + Status + Datum + Commit(s)
Teilprojekt: TP 9.4b — Native QR Decode Hardening (iOS + Android)
Status: TECHNISCH ABGESCHLOSSEN / READY FOR COMMIT
Datum: 2026-03-11 (Europe/Zurich)
Commit(s): noch offen

## Ziel

Den QR-Decode-Weg im Mobile Capture Screen so härten, dass QR-Kontaktcodes auf Android und iPhone robust gelesen werden, ohne den bestehenden Capture-/Parser-/Submit-Flow neu zu bauen.

## Umsetzung (Highlights)

- Bisherigen Expo-basierten QR-Live-Decode im Formularscreen ersetzt
- Neuen nativen QR-Scanner mit `react-native-vision-camera` eingeführt
- Bestehenden Parser-/Mapping-Layer bewusst beibehalten:
  - `apps/mobile/src/lib/qrContact.ts`
- QR bleibt eigenständige Kontakt-Erfassungsart im Kontakt-Screen
- OCR / Kontakte / Manuell bleiben unverändert
- Lead Submit / Patch Contact / Attachments bleiben unverändert

### Zusätzliche UX-Härtung
- Scanner-Status sichtbar gemacht:
  - Suche QR …
  - Noch nichts erkannt
  - QR erkannt
- Haptic Feedback bei erfolgreichem Treffer
- Taschenlampe manuell schaltbar
- Taschenlampe wird bei langsamem Scan automatisch aktiviert
- Übergabe nach Treffer beschleunigt
- Nutzer wird im Scan-Prozess nicht mehr im Ungewissen gelassen

## Dateien / Änderungen

### Geändert
- `apps/mobile/app/forms/[id].tsx`
- `apps/mobile/package.json`
- `apps/mobile/package-lock.json`

### Neu
- `apps/mobile/src/features/capture/NativeQrScannerSheet.tsx`
- `docs/teilprojekt-9.4b-native-qr-decode-hardening.md`

### Zusätzlich im Working Tree vorhanden
- `docs/teilprojekt-9.4a-qr-contact-capture-hardening.md` ist lokal geändert und vor Commit bewusst zu prüfen

## Architekturentscheid

Für den QR-Flow wird ein nativer QR-Scanner eingesetzt:

- `react-native-vision-camera`
- bestehender Parser in `src/lib/qrContact.ts` bleibt unverändert zentrale Basis
- minimal invasiver Eingriff nur im QR-Scanner-Pfad
- keine DB-Änderung
- keine API-Änderung
- kein Umbau des übrigen Capture-Flows

## Akzeptanzkriterien – Check

- [x] QR-Decode-Layer cross-platform gehärtet
- [x] Android + iPhone architektonisch berücksichtigt
- [x] bestehender Parser-/Mapping-Flow weiterverwendet
- [x] Mapping in bestehende Kontaktfelder bleibt intakt
- [x] OCR-/Kontakte-/Manuell-Flow bleibt intakt
- [x] Lead Submit bleibt intakt
- [x] klare UX / Fehlermeldungen
- [x] Android Realgerät erfolgreich getestet
- [ ] iPhone Realgerät separat prüfen
- [ ] `npm run typecheck` dokumentiert
- [ ] `npm run lint` dokumentiert
- [ ] `cd apps/mobile && npm run lint` dokumentiert
- [ ] Commit / Push
- [ ] `git status clean`

## Tests / Proof (reproduzierbar)

### Device Proof Android
Erfolgreich verifiziert auf realem Android-Gerät:

1. App gestartet
2. Aktivierung / Lizenz blieb stabil
3. Event gewählt
4. Formular geöffnet
5. Kontakt-Screen → QR-Code
6. QR-Scanner öffnet korrekt
7. Referenz-QR wird nun erkannt
8. Kontaktdaten werden übernommen
9. UX durch Status + Lichtführung deutlich verbessert
10. Mit automatisch/manuell aktivierter Taschenlampe spürbar bessere Erkennung

### Qualitätsbeobachtung
- Ohne Licht war der Scan funktional, aber zögerlich
- Mit Taschenlampe deutlich bessere Erkennung
- Deshalb Auto-Torch-Fallback ergänzt und final bestätigt

## Offene Punkte / Risiken

### P0
- iPhone Realgerät noch separat prüfen und dokumentieren

### P1
- Falls im Feldbetrieb generell dunkle Messesituationen dominieren:
  - später prüfen, ob QR standardmässig mit aktivem Licht starten soll
  - aktuell reicht Auto-Torch-Fallback

### P1
- Vor finalem Abschluss Working Tree bereinigen und 9.4a-Doku bewusst prüfen

## Next Step

1. Quality Gates lokal ausführen:
   - `npm run typecheck`
   - `npm run lint`
   - `cd apps/mobile && npm run lint`

2. Working Tree prüfen
3. Commit(s) erstellen
4. Push auf `main`
5. Rapport Commit-Hash ergänzen
6. TP 9.4b auf DONE setzen
