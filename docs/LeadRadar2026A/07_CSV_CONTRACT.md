# CSV Contract — LeadRadar Export (Leads + Kontakte + Formdaten)

Version: 1.1  
Stand: 2026-01-28  
Gültigkeit: ONLINE-only (MVP), Admin Export

## Ziel

Ein **CRM-importfreundlicher CSV Export**, der:
- **fixe, stabile Kontaktspalten** enthält (immer gleich),
- **Formdaten dynamisch** als zusätzliche Spalten anhängt (je nach Form),
- **Visitenkarten-Backup** referenziert (Attachment-Link),
- **robust** bleibt bei Feld-Umbenennungen (stabile `fieldKey`-Spalten).

---

## Datei- und Encoding-Regeln

### Encoding
- **UTF-8** (BOM optional; empfohlen für Excel/Windows)

### Zeilenumbrüche
- **LF** empfohlen  
- **CRLF** optional (wenn Excel/Windows-Import Probleme macht)

### Separator / Delimiter
- Default: **Semicolon `;`** (Excel CH/EU typisch)
- Optional: **Comma `,`**
- Export unterstützt Parameter:
  - `delimiter=semicolon|comma` (empfohlen)
  - tolerant: `delimiter=;` oder `delimiter=,`

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
2. `event_id` (string, optional)
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
12. `contact_full_name` (string, optional; wird aus first+last abgeleitet wenn verfügbar)
13. `contact_company` (string)
14. `contact_title` (string)
15. `contact_email` (string)
16. `contact_phone` (string)
17. `contact_mobile` (string, optional)
18. `contact_website` (string)
19. `contact_linkedin_url` (string, optional)

#### 3) Adresse (fix, optional aber stabil)
20. `contact_street` (string, optional)
21. `contact_zip` (string, optional)
22. `contact_city` (string, optional)
23. `contact_country` (string, optional)

#### 4) OCR / Qualität (fix, optional)
24. `ocr_status` (enum: `NONE|PENDING|DONE|FAILED`)
25. `ocr_confidence` (number 0..1, optional)
26. `ocr_warnings` (string; kurze Liste/Tags, z.B. `pending;corrected` oder `error:XYZ`)

#### 5) Visitenkarte Attachment (fix, optional)
27. `business_card_attachment_id` (string)
28. `business_card_image_url` (string; Download-URL oder signed URL)
29. `business_card_image_sha256` (string, optional)

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
- Number: string (normalisiert), optional später typed → aber **im CSV immer als string**
- Boolean: `true|false`
- Select: Label als string
- Multi-Select: `Option A;Option B`
- Date: ISO oder `YYYY-MM-DD` (Empfehlung ISO)

#### Backward Compatibility Regel
- Wenn ein Feld im Formbuilder umbenannt wird, bleibt `fieldKey` gleich → Spaltenname bleibt gleich.
- Wenn ein Feld gelöscht wird, bleibt die Spalte **optional** im Export:
  - Option A (MVP): Spalte wird nur exportiert, wenn Feld im **aktuellen** Formschema existiert.

---

## Sicherheits-/Zugriffsregeln (Admin Export)

- `business_card_image_url` ist:
  - entweder ein **Admin-Download-Endpunkt** (auth nötig),
  - oder eine **kurzlebige signed URL**.
- CSV enthält **keine API Keys**, keine Tokens, keine Secrets.

---

## Beispiel: Header (gekürzt)

```csv
tenant_slug;event_id;event_name;form_id;form_name;lead_id;lead_created_at;lead_updated_at;contact_source;contact_first_name;contact_last_name;contact_full_name;contact_company;contact_title;contact_email;contact_phone;contact_mobile;contact_website;contact_linkedin_url;contact_street;contact_zip;contact_city;contact_country;ocr_status;ocr_confidence;ocr_warnings;business_card_attachment_id;business_card_image_url;business_card_image_sha256;f_interest_product;f_notes
