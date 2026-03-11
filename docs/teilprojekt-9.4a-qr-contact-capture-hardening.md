# Schlussrapport — TP 9.4a: QR Contact Capture Hardening

## Titel + Status + Datum + Commit(s)

- Teilprojekt: 9.4a — QR Contact Capture Hardening
- Status: ABGESCHLOSSEN ALS TECHNISCHER KLÄRUNGS-/HARDENING-SCHRITT, NICHT DONE
- Datum: 2026-03-08 (Europe/Zurich)
- Commit(s): keine finalen Produktiv-Commits für DONE-Abschluss

## Ziel

Den QR-Kontaktimport im bestehenden Mobile-Capture-Flow härten und verifizieren, ob der aktuelle Expo-basierte QR-Decode-Weg für den GoLive-Anspruch ausreicht.

## Umsetzung (Highlights)

- Repo-Analyse des bestehenden QR-Flows in `apps/mobile/app/forms/[id].tsx`
- QR-Parser fachlich und technisch gehärtet
- QR-Parsing in separate Mobile-Lib ausgelagert:
  - `apps/mobile/src/lib/qrContact.ts`
- Unterstützte Formate erweitert/sauber strukturiert:
  - vCard
  - MECARD
  - BIZCARD
  - mailto
  - tel
  - MATMSG
  - JSON
  - Key/Value-Freiform
  - URI / Website
- QR-Scanner im Screen auf `barcodeTypes: ["qr"]` fokussiert
- zusätzlicher zweiter Decode-Pass als Expo-only Hardening versucht
- bestehende Flows nicht zurückgebaut:
  - OCR
  - Kontakte
  - manuell
  - Submit / Patch / Lead-Speicherung

## Dateien / Änderungen

- `apps/mobile/src/lib/qrContact.ts`
- `apps/mobile/app/forms/[id].tsx`
- `docs/teilprojekt-9.4a-qr-contact-capture-hardening.md`

## Akzeptanzkriterien – Check

- [x] QR-Kontaktimport analysiert und technisch gehärtet
- [x] Parser-/Mapping-Schicht erweitert
- [x] bestehender OCR-/Kontakte-/Manuell-Flow intakt belassen
- [x] Lead Submit weiterhin intakt im bestehenden Flow
- [x] klare UX / Debug-Hinweise für QR integriert
- [x] `npm run typecheck` wieder grün nach Pfadkorrektur
- [ ] `npm run lint` final verifiziert
- [ ] `cd apps/mobile && npm run lint` final verifiziert
- [ ] QR-Kontaktimport GoLive-ready
- [ ] vollständige Kontaktübernahme des Referenz-QR
- [ ] DONE-Abschluss mit Commit/Push/Hash

## Tests / Proof (reproduzierbar)

### Lokaler Qualitätscheck

```bash
cd /d/dev/leadradar2026a
npm run typecheck

Ergebnis:

npm run typecheck grün nach Korrektur des Dateipfads von qrContact.ts

Manueller Device-Proof

Ablauf:

App geöffnet

Event gewählt

Formular geöffnet

Kontakt-Screen → QR-Code

Referenz-QR gescannt

Ergebnis:

Hinweis: QR-Code erkannt

Interpretation weiterhin unvollständig

QR-Rohinhalt: Thomas Gemperle

Länge: 15

Technischer Befund

Der Parser ist nicht mehr das Hauptproblem.

Der aktuelle Decode-Layer liefert der App im Referenzfall weiterhin nur den verkürzten Payload Thomas Gemperle. Damit kommen die restlichen Kontaktdaten gar nicht bis in die App. Der aktuelle Expo-basierte QR-Decode-Weg ist für diesen Referenzfall damit nicht GoLive-safe.

Offene Punkte / Risiken
P0

QR-Kontaktimport ist in der aktuellen Expo-basierten Variante nicht GoLive-ready.

P1

Für echten GoLive-Anspruch braucht es einen robusteren nativen, plattformübergreifenden QR-Decode-Weg.

P2

iPhone muss im Nachfolge-Teilprojekt explizit mitberücksichtigt und real getestet werden.

Next Step

Teilprojekt 9.4b — Native QR Decode Hardening (iOS + Android) starten.

Ziel von TP 9.4b:

cross-platform QR-Decode-Weg für Android + iPhone

bestehenden Parser apps/mobile/src/lib/qrContact.ts weiterverwenden

QR-Capture-Mode austauschen, ohne OCR / Kontakte / Manuell / Submit-Flow zurückzubauen

