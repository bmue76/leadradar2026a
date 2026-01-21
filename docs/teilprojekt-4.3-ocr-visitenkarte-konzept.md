# Konzept — Teilprojekt 4.3: Visitenkarten-Scan + OCR + Kontakt-Matching (Mobile + Admin) — ONLINE-only (MVP)

Datum: 2026-01-21
Status: READY (Konzept) ✅

## Zielbild
Messepersonal erfasst Kontakte schnell und sauber, ohne Felder doppelt zu tippen:

- **Kontakt erfassen** als eigener Flow (UI-Entry in Mobile)
- Methoden: **Visitenkarte scannen**, **manuell erfassen**, **QR/vCard** (optional MVP), später **LinkedIn**
- Visitenkarten-Scan:
  - Foto → clientseitig **reduzieren & komprimieren** (SW genügt, best-effort)
  - Bild als Attachment `BUSINESS_CARD` mitsenden (für Audit/Review)
  - OCR Resultat erzeugen und als Kontakt-Vorschlag anzeigen
  - Kontakt wird übernommen → Formular wird (wo möglich) vorbefüllt
- Admin:
  - OCR sichtbar, prüfbar, korrigierbar
  - “In Kontakt übernehmen” (oder “Kontakt überschreiben”)
- Export:
  - CSV enthält **Kontakt + OCR Meta + dynamische Form-Felder** (Contract bereits in 07_CSV_CONTRACT.md)

---

## Scope (MVP)
### Must-have (P0)
- Mobile: Kontakt erfassen → Visitenkarte scannen → OCR trigger → Kontakt übernehmen → Lead speichern
- Mobile: Manuell erfassen (ohne OCR) + Kontakt übernehmen
- Attachment Upload (business_card) + OCR Result Persistenz (idempotent)
- Admin Lead Detail: Attachment Preview/Download + OCR Panel + Übernehmen/Korrigieren
- CSV Export: Kontaktspalten + OCR Meta + Formfelder (gemäss Contract)

### Nice-to-have (P1)
- QR/vCard Import (einfacher Parser)
- Auto-Fill Mapping (z.B. “company” → “firma”, “email” → “e-mail” etc.)

### Out of scope (später)
- LinkedIn Scan / Deep integrations
- Mehrere OCR Provider + Routing (Interface bleibt aber vorbereitet)

---

## UX (Mobile)
### Entry / Flow
- In Form Screen (oder Form Start): Button **„Kontakt erfassen“**
- Auswahl Bottom Sheet:
  1) **Visitenkarte scannen**
  2) **Manuell erfassen**
  3) **QR/vCard** (optional MVP)

### Visitenkarte scannen (MVP)
1) Kamera / Foto aufnehmen
2) Clientseitig preprocessing:
   - max Kantenlänge z.B. **1200 px**
   - JPEG/WebP Quality z.B. **0.6**
   - optional best-effort **Grayscale** (oder nur Kompression; SW ist „nice“)
3) Upload als Attachment: `kind=BUSINESS_CARD`
4) OCR Trigger: `mode="business_card"`
5) Ergebnis anzeigen:
   - Felder (Name, Firma, Rolle, Email, Phone, Website, Address)
   - Confidence (falls vorhanden) + Hinweis “Bitte prüfen”
6) Button **„Kontakt übernehmen“** → schreibt `lead.contact` + `contactSource="OCR"` + `ocrAttachmentId`

### Manuell erfassen (MVP)
- Formular “Kontakt” (Name/Firma/Email/Telefon …)
- Button **„Kontakt übernehmen“** → `contactSource="MANUAL"`

### UX-Regeln
- Kontaktfelder sind **separat** von den übrigen Lead-Form-Feldern.
- Formular bleibt schlank: Kontakt ist ein eigener Block, der (falls vorhanden) Formfelder vorbefüllt.

---

## Datenmodell (MVP)
### Attachment
- `LeadAttachment(kind=BUSINESS_CARD)`
- Speichert komprimiertes Bild (für Review / Debug)
- Meta: `mime`, `size`, `width/height` optional, `sha256` optional

### OCR Result
- `LeadAttachmentOcr`
  - `(tenantId, attachmentId, mode)` **unique** → idempotent
  - Felder:
    - `status`: `PENDING | RUNNING | DONE | FAILED`
    - `provider`: `tesseract | ...` (string)
    - `resultJson`: raw provider output (normiert + provider raw möglich)
    - `extractedJson`: normalisierte Kontaktfelder (optional aber empfohlen)
    - `errorMessage` optional
    - Timestamps: `createdAt/updatedAt`

### Lead Kontakt
- `Lead.contact` (JSON oder strukturierte Felder – je nach bestehendem Schema)
- Minimal normalisiert:
  - `firstName`, `lastName`
  - `company`
  - `title` (optional)
  - `email`
  - `phone`
  - `website`
  - `address` (optional)
- Meta:
  - `contactSource`: `OCR | MANUAL | QR`
  - `ocrAttachmentId` optional

---

## API Contract (MVP)
> Multi-Tenant via MobileAuthContext (tenantId/deviceId/apiKeyId). Tenant Header bleibt empfohlen, aber auth kann tenant-less fallback (TP 4.1).

### 1) Upload Attachment (business card)
**POST** `/api/mobile/v1/leads/:leadId/attachments` (multipart/form-data)
- fields:
  - `kind=business_card`
  - `file=@businesscard.jpg`
Response:
- `{ ok:true, data:{ attachmentId, kind, url?, createdAt } }`

### 2) OCR Trigger (idempotent)
**POST** `/api/mobile/v1/leads/:leadId/attachments/:attachmentId/ocr`
Body:
- `{ "mode":"business_card" }`
Response:
- `{ ok:true, data:{ ocrId, status, provider } }`
Notes:
- Wenn `(tenantId, attachmentId, mode)` bereits `DONE`, return 200 mit bestehendem Result (no duplicate work).

### 3) OCR Result holen
**GET** `/api/mobile/v1/leads/:leadId/attachments/:attachmentId/ocr?mode=business_card`
Response:
- `{ ok:true, data:{ status, provider, extracted?, result?, updatedAt } }`

### 4) Kontakt übernehmen / speichern
**PATCH** `/api/mobile/v1/leads/:leadId`
Body (Beispiel):
```json
{
  "contact": {
    "firstName":"Max",
    "lastName":"Muster",
    "company":"ACME AG",
    "email":"max@acme.ch",
    "phone":"+41 ...",
    "website":"https://..."
  },
  "contactSource":"OCR",
  "ocrAttachmentId":"<attachmentId>"
}

Kontakt-Matching / Mapping (MVP)

Normalisierte OCR Felder → Kontaktmodell:

full_name → split heuristisch in first/last (fallback: lastName=full)

email eindeutig

phone normalisieren (remove spaces, keep +)

Formular-Vorbefüllung (MVP):

Wenn Form Fields bekannte Keys/Labels enthalten (z.B. “E-Mail”, “Firma”, “Telefon”)

einfache Matching-Regeln (case-insensitive label contains)

Admin kann immer korrigieren (Source-of-truth bleibt Lead.contact)

Admin UI (MVP)

Lead Detail

Attachment Block:

Business Card Preview (Image) + Download

OCR Panel:

Status Badge + Provider + Timestamp

Liste extrahierter Kontaktfelder + Confidence (falls vorhanden)

Buttons:

„In Kontakt übernehmen“ (schreibt Lead.contact)

„Kontakt bearbeiten“ (editable Felder, speichert manuell)

Hinweis, dass OCR Fehler möglich sind

CSV Export (MVP)

Referenz: docs/LeadRadar2026A/07_CSV_CONTRACT.md

Fixe Kontakt-Spalten: contact_*

OCR Meta: ocr_status, ocr_provider, ocr_attachment_id

Dynamische Formfelder: field_<fieldId>__<labelSlug>

DoD — Teilprojekt 4.3
Functional

Device: Scan → Attachment Upload → OCR Trigger → Kontakt übernehmen → Lead speichern ✅

Admin: OCR sichtbar + übernehmen + korrigieren ✅

Export: CSV enthält Kontakt/OCR + Formfelder ✅

Proof / Smoke (reproduzierbar)

Provision → Forms laden → Lead erstellen

Business Card Upload → OCR Trigger → OCR Result sichtbar

Admin: OCR Panel + Übernahme

Export CSV → enthält contact_* + ocr_* + field_* ✅