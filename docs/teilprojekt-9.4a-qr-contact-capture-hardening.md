# Teilprojekt 9.4a — QR Contact Capture Hardening

## Titel + Status + Datum + Commit(s)

- Teilprojekt: TP 9.4a — QR Contact Capture Hardening
- Status: IMPLEMENTIERT, lokaler Proof / Typecheck / Lint / Commit noch ausstehend
- Datum: 2026-03-08 (Europe/Zurich)
- Commit(s): offen

## Ziel

Den QR-Kontaktimport im Mobile Capture Screen GoLive-tauglich härten, ohne die bestehenden Flows für OCR, Kontakte und manuelle Eingabe zurückzubauen.

## Umsetzung (Highlights)

- QR-Parsing aus `app/forms/[id].tsx` in eine zentrale Library ausgelagert:
  - `vCard`
  - `MECARD`
  - `BIZCARD`
  - `mailto`
  - `tel`
  - `MATMSG`
  - JSON / Schlüsselwert-Text / URI / heuristischer Freitext
- Live-Scan bleibt auf `expo-camera`, aber wird auf `barcodeTypes: ["qr"]` begrenzt.
- Neuer zweiter Decode-Pass für schwache oder unvollständige Live-Scans:
  - Kamera-Frame aufnehmen
  - zentral croppen
  - per `Camera.scanFromURLAsync(..., ["qr"])` erneut dekodieren
  - bestes Ergebnis über Scoring auswählen
- Schutz gegen unbrauchbare QR-Ergebnisse:
  - reine Namensdaten werden nicht mehr blind übernommen
  - nur brauchbare Kontaktdaten werden automatisch in die Kontaktfelder gemappt
- UX bereinigt:
  - klare Erfolg-/Fehlerhinweise
  - Rohinhalt bleibt für Entwicklung verfügbar, aber hinter Debug-Toggle

## Dateien / Änderungen

- `apps/mobile/src/lib/qrContact.ts`
  - neue zentrale QR-Parser-/Scoring-Logik
- `apps/mobile/app/forms/[id].tsx`
  - QR-Flow gehärtet
  - QR-only Scanner
  - zweiter Decode-Pass via Kamera-Foto
  - Debug-UI reduziert / gekapselt

## Architekturentscheid

Für TP 9.4a wurde **kein** separater nativer Scanner eingeführt.

Begründung:

1. Der bestehende Expo-Scanner bleibt funktional und integriert sich sauber in den vorhandenen Capture-Screen.
2. Das konkrete Problembild deutet darauf hin, dass Live-Decode in einzelnen Android-Fällen nur einen Teil des QR-Inhalts liefert.
3. Deshalb wird der Live-Scan nun durch einen gezielten zweiten Decode-Pass über ein aufgenommenes Bild ergänzt.
4. Der QR-Parser selbst wurde deutlich robuster gemacht, sodass mehr Kontaktformate sauber interpretiert werden.

## Akzeptanzkriterien – Check

- [x] QR-Kontaktimport technisch gehärtet
- [x] unterstützte QR-Formate erweitert und zentralisiert
- [x] Mapping in bestehende Kontaktfelder bleibt erhalten
- [x] bestehender OCR-/Kontakte-/Manuell-Flow bleibt im UI bestehen
- [x] Lead-Submit-Flow im Code nicht zurückgebaut
- [x] klare UX / Fehlermeldungen vorgesehen
- [ ] `npm run typecheck` → lokal ausstehend
- [ ] `npm run lint` → lokal ausstehend
- [ ] `cd apps/mobile && npm run lint` → lokal ausstehend
- [x] TP-Doku ergänzt
- [ ] `git status clean`, Commit, Push, Hash → lokal ausstehend

## Tests / Proof (reproduzierbar)

### Lokaler Start

```bash
cd /d/dev/leadradar2026a/apps/mobile
npx expo start --dev-client -c
Qualität
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint

cd /d/dev/leadradar2026a/apps/mobile
npm run lint
Manueller Smoke auf Android

App öffnen

Aktivierung / Lizenz prüfen

Event wählen

Formular öffnen

Kontakt-Screen öffnen

QR-Code als Kontakt-Erfassungsart wählen

Problem-QR erneut scannen

Erwartung:

schwacher Live-Scan löst automatisch zweiten Decode-Pass aus

wenn vollständige Kontaktdaten im QR enthalten sind, werden sie übernommen

reine Namensdaten werden nicht mehr stillschweigend als “erfolgreich” behandelt

Lead absenden

Prüfen, ob Daten im Backend / Admin korrekt ankommen

Referenzfall aus TP 9.4

Bisheriger Befund:

QR-Hinweis: QR erkannt, aber noch nicht interpretierbar

QR-Rohinhalt: Thomas Gemperle

Länge: 15

Erwartung nach TP 9.4a:

entweder vollständige Datenübernahme nach zweitem Decode-Pass

oder technisch saubere Einstufung als unbrauchbarer / unvollständiger QR ohne Blindübernahme

Offene Punkte / Risiken
P0

Keine.

P1

Der neue zweite Decode-Pass ist weiterhin an die Qualität des Kamera-Bildes und die Android-Decoder-Fähigkeit von expo-camera gebunden. Falls reale Geräte weiterhin systematisch abgeschnittene QR-Payloads liefern, wäre als nächster Schritt ein dedizierter nativer Scanner / alternativer Decoder zu prüfen.

P2

docs/LeadRadar2026A/05_RELEASE_TESTS.md und docs/LeadRadar2026A/00_INDEX.md wurden in diesem Schritt nicht angepasst, um ohne Repo-Vollkontext keine Doku-Navigation versehentlich zu beschädigen.

Next Step

Lokal Typecheck / Lint ausführen

Auf realem Samsung-Gerät den Referenz-QR erneut testen

Falls grün:

commit feat(tp9.4a): harden qr contact capture

optional Doku-Commit

Danach TP 9.4a mit echtem Proof und Commit-Hash final abschliessen
