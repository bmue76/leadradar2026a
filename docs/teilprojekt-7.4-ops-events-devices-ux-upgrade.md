# Teilprojekt 7.4 — Betrieb: Events & Geräte — UX Upgrade

## Ausgangslage
- Events & Geräte gehören in den operativen Bereich (“Betrieb”).
- UX-Ziele: klar, “Apple-clean”, ohne Developer-Texte im UI.
- Löschen soll möglich sein, aber nur wenn Objekte nie genutzt wurden (Guardrails).
- Multi-ACTIVE Events: Es können mehrere Events gleichzeitig aktiv sein (wichtig für Praxis).

## Ziele
1. **Löschen** in Events & Geräte: sichtbar, nachvollziehbar, mit Schutzlogik.
2. **Schönes Dialogfeld** statt `window.confirm` / Browser-Popups.
3. **Datum** konsequent: `dd.mm.yyyy` (Zeitraum) + “Updated” verständlich.
4. Events UI vereinfachen: **kein redundanter “Aktiv-Block”**, Tabelle ist Source of Truth.
5. Default-Sortierung der Events: **Startdatum** (statt Updated).

## Umsetzung (Kurz)
### Devices
- Lösch-Flow inkl. Hinweis, falls noch Lizenz/Bindung besteht.
- Bestätigungsdialog (UI) statt Browser-Popup.
- API-Key Revoke/Handling (Audit/UX).

### Events
- Event-Löschen wieder sichtbar (nur wenn erlaubt).
- UX-Dialog statt `window.confirm` (einheitliches Confirm-Modal).
- UI-Texte bereinigt (kein “activeEventId”-Developer-Hinweis im Screen/Copy).
- Zeitraum in `dd.mm.yyyy`.
- Default Sort: `Startdatum`.
- Redundanten oberen Block entfernt, weil:
  - Multi-ACTIVE führt sonst zu falscher/irreführender Darstellung (“nur 1 aktiv”),
  - Tabelle ist übersichtlich genug.

## Technische Änderungen (API)
- `deleteEventIfAllowed(...)` liefert:
  - ok:true + id, oder
  - ok:false + code/message + details (counts + status)
- `getActiveOverview(...)` wurde (vorerst) beibehalten für Abwärtskompatibilität/evtl. spätere Nutzung.
- Event-Listing kann optional Counts liefern (für “canDelete”/UX-Entscheide).

## UI/UX Regeln (MVP)
- **Delete nur anbieten**, wenn `canDelete=true`.
- Wenn Delete nicht erlaubt:
  - Dialog zeigt verständlichen Grund (“bereits genutzt oder referenziert”)
  - Optional: Details (Leads/Formulare/Devices Anzahl) für Support/Debug.
- Status-Chips:
  - Aktiv = grün,
  - Entwurf = neutral,
  - Archiviert = grau.
- Datum:
  - Zeitraum: `dd.mm.yyyy` (ohne Uhrzeit),
  - Updated: `dd.mm.yyyy hh:mm` (falls gewünscht).

## Testplan (manuell)
### Events
1. Neues Event erstellen (ohne Leads, ohne Assignments).
2. Prüfen:
   - Zeitraum wird `dd.mm.yyyy` angezeigt.
   - Default Sort = Startdatum.
3. Event löschen -> **muss gehen** (Confirm Dialog erscheint).
4. Event aktivieren und danach löschen -> **muss blockieren** (nicht löschbar).
5. Event referenzieren:
   - Form assignedEventId setzen ODER Device activeEventId setzen ODER Lead mit eventId erzeugen,
   - Löschen -> **muss blockieren** und verständliche Meldung zeigen.
6. Multi-ACTIVE:
   - Zwei Events aktiv setzen,
   - Tabelle zeigt beide als “Aktiv”.

### Devices
1. Device ohne Bindungen löschen -> **muss gehen** (Confirm Dialog).
2. Device mit laufender Lizenz / relevanter Bindung -> Hinweis + explizite Bestätigung.

## Abnahme (Definition of Done)
- `npm run typecheck` ✅
- `npm run lint` ✅ (keine Warnings als Gate, wenn möglich)
- Delete-Buttons sichtbar & korrekt “guarded”
- Kein Browser-confirm im kritischen Flow
- Datum `dd.mm.yyyy` im Zeitraum
- Docs + Index + Schlussrapport committed & pushed

## Offene Punkte / Nächste Schritte
- Begriff “Betrieb” (Navigation) ggf. später finalisieren (Wording/IA).
- Optional: Event-Listenanzeige um kleine “Delete allowed” Info ergänzen (nur Admin/Debug).
