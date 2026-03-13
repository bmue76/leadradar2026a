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
`leads.types.ts` wurde präzisiert:

- Attachment-Typen als open-ended dokumentiert
- `AdminLeadDetail` um bekannte Detailfelder ergänzt
- Kompatibilitätsfelder für gemischte Response-Formen beibehalten

### UI
`LeadDetailDrawer.tsx` wurde gezielt erweitert:

1. **Business Card / OCR**
   - Business Card bleibt separat im OCR-Bereich sichtbar
   - Preview ist auch dann sichtbar, wenn noch kein OCR-Resultat vorliegt
   - Open + Download vorhanden
   - Fallback-Hinweis, wenn keine explizite `BUSINESS_CARD_IMAGE` vorhanden ist und stattdessen das erste Bild verwendet wird

2. **Attachments & media**
   - klare Trennung in:
     - Voice messages / audio
     - Additional images
     - PDFs & files
   - Business Card wird nicht nochmals doppelt in der allgemeinen Attachment-Liste angezeigt
   - Audio erhält Inline-Player + Open + Download
   - Bilder erhalten Inline-Preview + Open + Download
   - PDFs erhalten Open + Download
   - Weitere Dateien erhalten Download

3. **Metadaten**
   - pro Attachment sinnvoll sichtbar:
     - fachlicher Typ
     - MimeType
     - Größe
     - CreatedAt

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

OCR-Bereich zeigt Visitenkarte mit Preview

Open / Download funktionieren

Lead mit zusätzlichem Bild öffnen

Bild erscheint unter Additional images

Open / Download funktionieren

Lead mit PDF öffnen

PDF erscheint unter PDFs & files

Open / Download funktionieren

Lead mit Sprachnachricht öffnen

Audio erscheint unter Voice messages / audio

Audio-Player funktioniert

Download funktioniert

Lead mit Kombination aus Business Card + Zusatzbild + PDF + Audio öffnen

Business Card nur im OCR-Bereich

zusätzliche Medien sauber getrennt

Tenant-Scope Smoke

falscher Tenant / falsche Lead-ID / falsche attachmentId liefert weiterhin 404

Risiken / Hinweise

OCR-API kann weiterhin einen Bild-Fallback verwenden, falls keine explizite BUSINESS_CARD_IMAGE vorhanden ist. Das ist absichtlich defensiv, um ältere Leads nicht zu verschlechtern.

Audio-Playback hängt browserseitig vom unterstützten MIME-/Codec-Format ab. Download bleibt in jedem Fall verfügbar.

Next Step

Nach lokalem Proof:

Commit:

feat(tp9.6a): improve admin lead attachment visibility

optional separater Docs-Commit:

docs(tp9.6a): document admin lead attachment visibility
