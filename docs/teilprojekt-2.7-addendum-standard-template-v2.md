# Addendum — TP 2.7: Standard Template v2 (Formular-Vorlage)

Datum: 2026-01-08  
Status: DONE ✅ (Template Felder) / TODO ⏳ (Neue FieldTypes Upload/Date)

## Ziel
Den Standard-Formular-Template-Generator (/api/admin/v1/forms/from-template) so erweitern, dass die Mustervorlage
aus dem bereitgestellten PDF direkt als DRAFT-Form angelegt wird (Kontaktinformationen + Individualfelder).

## Umsetzung
- Route: POST /api/admin/v1/forms/from-template
- Template: "standard" (Version 2)
- Ergebnis: Beim Erstellen werden folgende Felder angelegt:

Kontaktinformationen:
- company, firstName*, lastName*, salutation, jobTitle, street, zip, city, country
Zusätzlich (aus MVP):
- email, phone, consent (optional)
Individualfelder (aus PDF):
- leadType (Single Select, Optionen)
- handledBy (Single Select, Mitarbeiter/in A–C)
- responsible (Single Select, Mitarbeiter/in A–C)
- leadQuality (Single Select, A/B/C)
- interest (Multi Select, Produkt A–C)
- followUp (Multi Select, Rückruf/Termin/Unterlagen)
- urgency (Single Select, sehr dringend/dringend/nicht dringend)
- notes (TextArea)

## Proof
1) Admin → Forms → “Neues Formular” → “Aus Vorlage erstellen”
2) Das neue Formular öffnet sich unter /admin/forms/[id]
3) Im Builder erscheinen alle Felder inkl. Select-Options.

## Backlog (innerhalb TP 2.7, aber noch NICHT umgesetzt)
Weitere Felder aus PDF:
- Datum (Picker) → neuer FieldType DATE + Renderer (Admin Preview + Mobile)
- Datei-Upload / Foto-Upload → Attachment-Flow + Storage + UI + Mobile
Diese Erweiterungen brauchen:
- FieldType Erweiterung + Validierung
- LeadAttachment handling (create + download) und UI
- Storage (Dev+Prod) sauber

## Commit (Vorschlag)
feat(templates): expand standard form template fields (tp 2.7 addendum)
