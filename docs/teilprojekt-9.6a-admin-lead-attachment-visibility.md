# Teilprojekt 9.6a — Admin Lead Attachment Visibility

Status: IN PROGRESS  
Datum: 2026-03-13  
Phase: 1 (ONLINE-only)

## Ziel

Die Lead-Detailansicht im Admin soll alle erfassten Anhänge klar, ruhig und GoLive-tauglich sichtbar machen:

- Business Card sichtbar und weiterhin OCR-fähig
- zusätzliche Bilder sichtbar
- PDFs sichtbar
- Audio / Sprachnachricht sichtbar und abspielbar
- tenant-safe, ohne API-/DB-Regression

## Korrektur zum ersten Versuch

Der erste technische Ansatz hat versehentlich `LeadDetailDrawer.tsx` angepasst.  
Die tatsächlich aktive Detailansicht läuft im aktuellen Admin jedoch in:

- `src/app/(admin)/admin/leads/LeadsClient.tsx`

TP 9.6a wurde deshalb auf den **live verwendeten Drawer in `LeadsClient.tsx`** korrigiert.

## Ist-Analyse

Die bestehende Detail-API liefert für `attachments` bereits alle relevanten Daten:

- `id`
- `type`
- `filename`
- `mimeType`
- `sizeBytes`
- `createdAt`

Der bestehende Download-Endpunkt ist bereits vorhanden und leak-safe tenant-scoped:

- `GET /api/admin/v1/leads/[id]/attachments/[attachmentId]/download`
- unterstützt `disposition=inline|attachment`

Damit war für TP 9.6a keine DB-Migration und keine zwingende API-Erweiterung nötig.

## Umsetzung

### DB
Keine Änderung.

### API
Keine Änderung am Vertrag erforderlich.  
Bestehende tenant-scoped Download-Route wird weiterverwendet.

### DTO
Keine neue Pflicht-Erweiterung.  
Die Detaildarstellung nutzt den bestehenden Attachment-Contract.

### UI
Die aktive Drawer-Ansicht in `LeadsClient.tsx` wurde gezielt erweitert:

1. **Visitenkarte / OCR**
   - Business Card bleibt separat sichtbar
   - Preview, Öffnen und Download vorhanden
   - OCR-Steuerung bleibt intakt
   - defensiver Bild-Fallback bleibt möglich
   - Hinweis sichtbar, wenn Fallback statt expliziter `BUSINESS_CARD_IMAGE` genutzt wird

2. **Sprachnachrichten / Audio**
   - eigener Block
   - Audio-Player inline
   - Öffnen + Download
   - Dateiname, Typ, MimeType, Größe, CreatedAt sichtbar

3. **Weitere Bilder**
   - eigener Block
   - Inline-Preview
   - Öffnen + Download
   - Metadaten sichtbar

4. **PDFs / Dateien**
   - eigener Block
   - PDF: Öffnen + Download
   - sonstige Dateien: Download
   - Metadaten sichtbar

5. **Saubere Trennung**
   - Business Card wird nicht nochmals doppelt in allgemeinen Anhängen angezeigt
   - Audio erscheint nicht mehr als unbekannte Datei

## Akzeptanzkriterien

- [x] Business Card bleibt sichtbar
- [x] zusätzliche Attachments im Admin sichtbar
- [x] Audio / Sprachnachricht sinnvoll sichtbar
- [x] Bild / PDF / Audio nutzbar (inline/open/download passend)
- [x] bestehende Lead-Detailansicht bleibt intakt
- [x] tenant-scope bleibt leak-safe
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] reproduzierbarer Smoke im lokalen System
- [x] Docs aktualisiert

## Reproduzierbarer Proof

```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
Manual Smoke

Lead mit Business Card öffnen

OCR-/Visitenkartenbereich zeigt Preview

Öffnen / Download funktionieren

Lead mit zusätzlichem Bild öffnen

Bild erscheint unter Weitere Bilder

Öffnen / Download funktionieren

Lead mit PDF öffnen

PDF erscheint unter PDFs / Dateien

Öffnen / Download funktionieren

Lead mit Sprachnachricht öffnen

Audio erscheint unter Sprachnachrichten / Audio

Audio-Player funktioniert

Download funktioniert

Lead mit Kombination aus Business Card + Zusatzbild + PDF + Audio öffnen

Business Card separat

zusätzliche Medien sauber getrennt

Tenant-Scope Smoke

falscher Tenant / falsche Lead-ID / falsche attachmentId liefert weiterhin 404

Risiken / Hinweise

OCR-API kann weiterhin einen Bild-Fallback verwenden, falls keine explizite BUSINESS_CARD_IMAGE vorhanden ist. Das ist absichtlich defensiv, um ältere Leads nicht zu verschlechtern.

Audio-Playback hängt browserseitig vom unterstützten MIME-/Codec-Format ab. Download bleibt unabhängig davon verfügbar.

Next Step

Nach lokalem Proof:

Commit:

fix(tp9.6a): wire admin attachment visibility into live leads drawer

optional zusätzlicher Docs-Commit:

docs(tp9.6a): correct live admin attachment visibility path
