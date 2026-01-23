# Schlussrapport — Teilprojekt 4.4: Visitenkarten-Scan + OCR + Kontakt-Flow (Mobile + API) — ONLINE-only (MVP)

Datum: 2026-01-23  
Status: DONE ✅

## Ziel / Scope
Messepersonal soll in der Mobile-App einen Lead erfassen können und optional eine Visitenkarte scannen:
- Visitenkarte fotografieren
- On-Device OCR (ML Kit) ausführen
- OCR Result im Backend speichern (pro Attachment)
- OCR Vorschläge im UI anzeigen und in Kontaktfelder übernehmen
- Kontakt-Daten am Lead via Mobile API patchen

**Wichtig:** ONLINE-only (MVP). Kein Offline-Queueing, keine Cloud-OCR-Pflicht.

---

## Ergebnis (Was ist umgesetzt)
### Mobile (Expo App)
- Business-Card Scan Flow in `apps/mobile/app/forms/[id].tsx`:
  - Scan/Foto aufnehmen
  - Thumbnail + OCR Vorschau anzeigen
  - Kontaktfelder als Draft (übernehmbar / editierbar)
  - Submit-Pipeline:  
    1) Lead erstellen  
    2) Attachment hochladen  
    3) OCR Result speichern  
    4) Kontakt am Lead setzen
- OCR Engine:
  - `@infinitered/react-native-mlkit-text-recognition` (On-device)
  - Wrapper `apps/mobile/src/ocr/*` (types + recognizeTextFromBusinessCard)
- Mobile API Client Hardening:
  - `apps/mobile/src/lib/api.ts` ohne `any` (lint-konform)
  - Robustere Response-Auswertung (IDs aus verschiedenen Shapes extrahieren)
  - Multipart Upload via FormData (RN kompatibel)

### Backend / API (Next.js Route Handlers)
- **Mobile OCR Endpoint** `src/app/api/mobile/v1/attachments/[attachmentId]/ocr/route.ts`
  - GET: OCR Result lesen (pro `mode`)
  - POST/PUT kompatibel: OCR Result speichern (Idempotency via `resultHash`)
  - Response kompatibel zur App: liefert eine ID, damit `storeAttachmentOcrResult()` “grün” ist
- **Kontakt Patch Endpoint** `src/app/api/mobile/v1/leads/[id]/contact/route.ts`
  - Akzeptiert Mobile Payload inkl. `contactSource`, optional `contactOcrResultId`, plus `contact*` Felder
  - Toleriert leere Strings / optionales Payload (kein 400 mehr bei „leeren“ Feldern)
  - Prisma-Update typ-sicher umgesetzt (Typecheck/build grün)

### Fixes / Stabilisierung im Zuge TP 4.4
- Next.js Build-Fix: `/login` (useSearchParams) so angepasst, dass Build/Prerender grün ist
- Lint-Fix: “no-explicit-any” & Image alt requirement im Mobile Screen bereinigt

---

## Akzeptanzkriterien (DoD)
✅ Mobile Lead Capture funktioniert weiterhin ohne Visitenkarte  
✅ Mit Visitenkarte:
- ✅ Foto aufnehmen, Vorschau sichtbar
- ✅ OCR läuft (MLKit), Raw-Text Vorschau vorhanden
- ✅ Lead wird erstellt
- ✅ Attachment wird hochgeladen (BUSINESS_CARD_IMAGE)
- ✅ OCR Result wird im Backend gespeichert (pro Attachment)
- ✅ Kontakt Patch funktioniert (kein 400 “Invalid request body”)
- ✅ Admin sieht Lead + Bild, OCR Result ist gespeichert
✅ `npm run typecheck` grün  
✅ `npm run lint` grün  
✅ `npm run build` grün

---

## Manuelle Test-Checkliste (App)
1. Provisioning → Forms list laden
2. Form öffnen → „Visitenkarte scannen“ → Foto erstellen
3. OCR Vorschau prüfen
4. Kontaktfelder übernehmen/ändern
5. Absenden
6. Erwartete Requests:
   - `POST /api/mobile/v1/leads` → 200
   - `POST /api/mobile/v1/leads/:leadId/attachments` → 200
   - `POST /api/mobile/v1/attachments/:attachmentId/ocr` → 200
   - `PATCH /api/mobile/v1/leads/:leadId/contact` → 200
7. Admin prüfen: Lead vorhanden, Attachment vorhanden, OCR Result vorhanden, Kontaktfelder gesetzt

---

## Wichtige technische Notizen
- OCR Result wird **pro Attachment + mode** gespeichert (Idempotency über `resultHash`).
- MLKit ist **on-device** (schnell, kostenlos, datensparsam), aber Trefferqualität hängt stark von Fotoqualität ab (Licht, Winkel, Reflexion).
- Cloud-Fallback (z.B. Google Vision) ist **nicht** Teil dieses MVP/TP – vorgesehen als späteres Upgrade, wenn nötig.

---

## Änderungen / Commits (Auszug)
- `fix(mobile): remove explicit any + add alt on Image (lint)` (8f6e983)
- `fix(tp4.4): mobile OCR response id + contact patch compat` (4c3c362)
- plus begleitende Stabilisierung rund um Login/Build und Route-Handler Typen

---

## Offene Punkte / Nächste Schritte
- **Trefferqualität messen**: Testset (10–20 echte Karten) + Auswertung (Name/Email/Phone/Company Trefferquote)
- Optional: **Server-Fallback OCR** (Cloud) als `mode=SERVER_FALLBACK`
- Optional: Admin UI „OCR Review“ (Korrektur-Workflow) / Export-Verbesserungen
- Optional: automatisierter Smoke-Test für OCR/Contact-Flow (ähnlich mobile-smoke)

