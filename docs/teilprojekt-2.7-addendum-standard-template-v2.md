# Addendum — TP 2.7: Standard Template (Mustervorlage)

Datum: 2026-01-08  
Status: DONE ✅

## Ziel
Standard-Formular-Template so ausrichten, dass die Kontaktinformationen nur die gelb markierten OCR-Felder enthalten.
Alle weiteren Kontaktfelder sind bewusst nicht im Template und können individuell ergänzt werden.

## Umsetzung
Route:
- POST /api/admin/v1/forms/from-template (templateKey: "standard")

Template "standard" (Version 3):
Kontaktinformationen (ONLY gelb markiert):
- company (Firma, OCR)
- firstName (Vorname, OCR) *
- lastName (Nachname, OCR) *
- jobTitle (Funktion, OCR)
- street (Adresse Strasse/Nr., OCR)
- zip (PLZ, OCR)
- city (Ort, OCR)

Individualfelder:
- leadType (Single Select, Optionen)
- handledBy (Single Select, Mitarbeiter/in A–C)
- responsible (Single Select, Mitarbeiter/in A–C)
- leadQuality (Single Select, A/B/C)
- interest (Multi Select, Produkt A–C)
- followUp (Multi Select, Rückruf/Termin/Unterlagen)
- urgency (Single Select, sehr dringend/dringend/nicht dringend)
- notes (TextArea)

## Proof
1) /admin/forms → Create form → From template
2) Neues Formular wird erstellt (DRAFT)
3) /admin/forms/[id] → Builder: Felder erscheinen wie oben, Select-Optionen editierbar

## Backlog (nicht Teil dieses Addendums)
- Datum (Picker)
- Datei-Upload
- Foto-Upload
