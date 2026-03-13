# Schlussrapport — TP 9.6 Mobile Capture Attachments & Voice Message

## Titel + Status + Datum + Commit(s)
- Teilprojekt: TP 9.6 — Mobile Capture Attachments & Voice Message
- Status: DONE
- Datum: 2026-03-13 (Europe/Zurich)
- Commit(s): ausstehend

## Ziel
Den bestehenden Mobile-Capture-Flow um echte zusätzliche Erfassungsmedien erweitern, ohne den bestehenden QR-/OCR-/Contacts-/Manual-Flow zu beschädigen:

- Sprachnachricht im Mobile-Capture
- zusätzliche Anhänge im Mobile-Capture
- saubere Einbindung in den bestehenden Lead-Submit-Flow
- sichtbare States und Fehlerfälle
- ONLINE-only, minimal invasiv, ohne unnötige DB-/API-Erweiterung

## Umsetzung (Highlights)
- Repo-Analyse bestätigt: keine DB-Migration und keine neue Backend-Route nötig.
- Bestehende Mobile-Upload-Route akzeptiert Audio bereits; für TP 9.6 wird Audio als `AttachmentType=OTHER` geführt.
- Mobile um Expo-kompatible Medienfunktionen erweitert:
  - `expo-audio`
  - `expo-document-picker`
- App-Config ergänzt:
  - Android `RECORD_AUDIO`
  - iOS `NSMicrophoneUsageDescription`
  - Expo-Audio-Plugin
- Mobile Capture Screen (`apps/mobile/app/forms/[id].tsx`) erweitert:
  - echte Audio-Aufnahme / Audio-Auswahl
  - echte Attachment-Auswahl für Bild/Foto und PDF
  - Prüfen / Entfernen / erneute Aufnahme
  - Upload-States pro Medium
- Wichtige Korrektur im Verlauf:
  - Builder-Felder mit `field.config.variant = "audio"` bzw. `"attachment"` wurden initial als normales Textfeld gerendert
  - Mobile-Renderer wurde danach sauber erweitert, sodass diese Varianten nun echte Inline-Capture-Controls rendern
- Submit-Reihenfolge sauber:
  1. Lead erstellen
  2. optional Business-Card-Attachment + OCR speichern
  3. Kontakt patchen
  4. Audio-/Attachment-Felder als Lead-Attachments hochladen
- Partial-Failure-Schutz eingebaut:
  - wenn Lead schon gespeichert ist, Folgefehler sichtbar
  - kein blindes Doppel-Submit
  - sauberer Zustand mit „Neuer Lead“

## Dateien / Änderungen
- `apps/mobile/package.json`
- `apps/mobile/app.json`
- `apps/mobile/src/lib/api.ts`
- `apps/mobile/app/forms/[id].tsx`
- `docs/teilprojekt-9.6-mobile-capture-attachments-voice.md`

## Akzeptanzkriterien – Check
- [x] Voice Message im Capture integrierbar
- [x] zusätzliche Anhänge im Capture integrierbar
- [x] bestehender Lead-Submit bleibt intakt
- [x] bestehender QR / OCR / Contacts / Manual Flow bleibt intakt
- [x] Upload-States / Fehlerfälle sichtbar
- [x] UI ruhig und verständlich
- [x] Media-Felder aus dem Formbuilder werden nicht mehr als reine Texteingabe gerendert
- [x] Audio-/Attachment-Felder rendern als echte Inline-Capture-Controls
- [x] Mini-Proof erfolgreich: Attachments landen korrekt am Lead

## Tests / Proof (reproduzierbar)
### Quality Gates
```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint

cd /d/dev/leadradar2026a/apps/mobile
npm run lint
Native Refresh
cd /d/dev/leadradar2026a/apps/mobile
npm install
npx expo run:android
# bzw. npx expo run:ios
npx expo start --dev-client -c
Manuelle Smoke-Tests

Manual Lead + Sprachnachricht: erfolgreich

Manual Lead + Bild: erfolgreich

Manual Lead + PDF: erfolgreich

OCR / Business Card + Zusatzanhang: erfolgreich

OCR / Business Card + Sprachnachricht: erfolgreich

Builder-Feld audio: rendert als Audio-Control, nicht mehr als Texteingabe

Builder-Feld attachment: rendert als Attachment-Control, nicht mehr als Texteingabe

Mini-Proof

Prisma Studio geprüft

Test-Leads geöffnet

LeadAttachment geprüft

Ergebnis:

Business Card als BUSINESS_CARD_IMAGE vorhanden

Zusatzbild / PDF als normale Lead-Attachments vorhanden

Sprachnachricht als normales Lead-Attachment mit Audio-MIME-Type vorhanden

Offene Punkte / Risiken
P1

Admin-UI stellt Business Card aktuell sichtbar heraus, zusätzliche Attachments / Audio aber noch nicht optimal differenziert dar.

P1

Sprachnachricht wird für TP 9.6 bewusst als AttachmentType=OTHER gespeichert. Fachlich genügt das für den MVP. Eine spätere Spezialisierung auf eigenen Attachment-Type wäre separat zu schneiden.

P1

Admin-Sichtbarkeit der Zusatzanhänge und Audio sollte als Folgeprojekt umgesetzt werden.

Next Step

TP 9.6a — Admin Lead Attachment Visibility:

Zusatzanhänge in der Lead-Detailansicht sauber sichtbar machen

Sprachnachricht klar als Audio darstellen

Business Card vs. weitere Anhänge sauber trennen

Inline / Download UX im Admin ergänzen
