# CSV Contract — LeadRadar Export (Leads + Kontakte + Formdaten)

Version: 1.0  
Stand: 2026-01-20  
Gültigkeit: ONLINE-only (MVP), Admin Export

## Ziel

Ein **CRM-importfreundlicher CSV Export**, der:
- **fixe, stabile Kontaktspalten** enthält (immer gleich),
- **Formdaten dynamisch** als zusätzliche Spalten anhängt (je nach Form),
- **Visitenkarten-Backup** referenziert (reduzierte S/W-Version als Attachment-Link),
- **robust** bleibt bei Feld-Umbenennungen (stabile `fieldKey`-Spalten).

---

## Datei- und Encoding-Regeln

### Encoding
- **UTF-8** (ohne BOM empfohlen; BOM optional, wenn Excel-Fokus)

### Zeilenumbrüche
- **LF** empfohlen  
- **CRLF** optional (wenn Excel/Windows-Import Probleme macht)

### Separator / Delimiter
- Default: **Comma `,`**
- Optional: **Semicolon `;`** für Excel CH/EU (typisch)
- Export muss einen Parameter unterstützen: `delimiter=comma|semicolon`

### Quoting / Escaping (RFC 4180 kompatibel)
- Felder werden **in Anführungszeichen `"` gesetzt**, wenn sie:
  - das Trennzeichen enthalten,
  - `"` enthalten,
  - Zeilenumbrüche enthalten.
- `"` im Inhalt wird als `""` escaped.

### Header
- **Erste Zeile ist Header**
- Spaltenreihenfolge ist **stabil** (siehe unten)

---

## Datentypen & Normalisierung

### Datums-/Zeitwerte
- ISO 8601 UTC: `YYYY-MM-DDTHH:mm:ss.sssZ`  
  Beispiel: `2026-01-20T21:05:06.335Z`

### Booleans
- `true` / `false` (klein)

### Numbers
- Dezimalpunkt `.`  
- Keine Tausendertrennzeichen

### Arrays / Multi-Select
- Werte werden als **Semikolon-getrennte Liste** exportiert (unabhängig vom CSV-Delimiter)  
  Beispiel: `Option A;Option B;Option C`

### Leere Werte
- Leeres Feld (nichts zwischen Delimitern), keine `null` Strings.

---

## Spaltenmodell: Fix + Dynamisch

### A) Fixe Spalten (immer vorhanden)

> Diese Spalten stehen **in jedem Export** und sind **stabil**.

#### 1) Kontext / Identifikation
1. `tenant_slug` (string)
2. `event_id` (string, optional wenn Events noch nicht überall aktiv sind)
3. `event_name` (string, optional)
4. `form_id` (string)
5. `form_name` (string)
6. `lead_id` (string)
7. `lead_created_at` (datetime ISO)
8. `lead_updated_at` (datetime ISO, optional)

#### 2) Kontakt (fix, CRM-friendly)
9.  `contact_source` (enum: `BUSINESS_CARD|MANUAL|QR|LINKEDIN|NONE`)
10. `contact_first_name` (string)
11. `contact_last_name` (string)
12. `contact_full_name` (string, optional; falls verfügbar)
13. `contact_company` (string)
14. `contact_title` (string)
15. `contact_email` (string)
16. `contact_phone` (string)
17. `contact_mobile` (string, optional)
18. `contact_website` (string)
19. `contact_linkedin_url` (string)

#### 3) OCR / Qualität (fix, optional)
20. `ocr_status` (enum: `NONE|PENDING|DONE|FAILED`)
21. `ocr_confidence` (number 0..1, optional)
22. `ocr_warnings` (string; kurze Liste/Tags oder JSON-light)

#### 4) Visitenkarte Attachment (fix, optional)
23. `business_card_attachment_id` (string)
24. `business_card_image_url` (string; Download-URL oder signed URL)
25. `business_card_image_sha256` (string, optional)

---

### B) Dynamische Formspalten (abhängig vom Formschema)

> Dynamische Spalten werden **nach den fixen Spalten** angehängt.

#### Naming-Standard (MUST)
- Spaltenname: `f_<fieldKey>`
- `fieldKey` ist:
  - **stabil** (nicht abhängig vom Label),
  - **unique pro Form**,
  - **snake_case**, nur `[a-z0-9_]`,
  - max. 64 Zeichen empfohlen.

Beispiele:
- `f_interest_product`
- `f_budget_range`
- `f_followup_permission`
- `f_notes`

#### Werteformat
- Text: string
- Number: string (normalisiert), optional zusätzlich in Zukunft typed columns → aber **im CSV immer als string**
- Boolean: `true|false`
- Select: Label als string
- Multi-Select: `Option A;Option B`
- Date: ISO oder `YYYY-MM-DD` (Empfehlung ISO)

#### Backward Compatibility Regel
- Wenn ein Feld im Formbuilder umbenannt wird, bleibt `fieldKey` gleich → Spaltenname bleibt gleich.
- Wenn ein Feld gelöscht wird, bleibt die Spalte **optional** im Export:
  - Option A (empfohlen): Spalte bleibt nur, wenn Feld im aktuellen Formschema existiert.
  - Option B: Spalte bleibt, wenn sie in exportierten Leads historisch vorkam.
- Für MVP nehmen wir: **Option A**.

---

## Optional: “Flache” Lead-Spalten (Phase 2)

Diese sind NICHT Teil von v1.0, aber reserviert:
- `lead_status`
- `lead_owner`
- `lead_tags`

---

## Fehlertoleranz / Importfreundlichkeit

- Headernames sind **ASCII-only** (keine Umlaute).
- Keine verschachtelten Objekte; alles flach.
- Warnings sind kurz (max ~500 chars), keine riesigen JSON Blobs.

---

## Sicherheits-/Zugriffsregeln (Admin Export)

- `business_card_image_url` ist:
  - entweder ein **Admin-Download-Endpunkt** (auth nötig),
  - oder eine **kurzlebige signed URL**.
- CSV enthält **keine API Keys**, keine Tokens, keine Secrets.

---

## Beispiel: Header (gekürzt)

```csv
tenant_slug,event_id,event_name,form_id,form_name,lead_id,lead_created_at,lead_updated_at,contact_source,contact_first_name,contact_last_name,contact_company,contact_email,contact_phone,ocr_status,ocr_confidence,business_card_image_url,f_interest_product,f_notes
