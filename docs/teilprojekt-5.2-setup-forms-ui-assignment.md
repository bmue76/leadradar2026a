# Teilprojekt 5.2 — Setup → Formulare UI (Liste + Detail/Drawer) inkl. Zuweisung zum aktiven Event (Option 2) — ONLINE-only (MVP)

Datum: 2026-01-30  
Status: DONE ✅

## Ziel
Setup → Formulare ist produktiv nutzbar:
- `/admin/forms` zeigt Finder-like Liste (Apple-clean, de-CH)
- Row-Klick öffnet Detail-Drawer (rechts)
- Im Drawer: Status ändern, Zuweisung “Im aktiven Event verfügbar”, Builder/Preview, Duplizieren, Archivieren/Wiederherstellen
- Option 2 Regel ist end-to-end umgesetzt: Mobile sieht nur `ACTIVE` + `assignedEventId === activeEvent.id`
- Admin Home Readiness (TP 5.1) wird durch Zuweisung “grün”

## Umsetzung (Highlights)
- Admin Forms API erweitert:
  - List mit `q/status/assigned/sort/dir`
  - `assignedToActiveEvent` serverseitig berechnet (bezogen auf aktives Event)
  - PATCH unterstützt Status + Assignment in einem Contract (backward-compatible)
  - Duplizieren erstellt DRAFT-Kopie ohne Assignment, inkl. Field-Kopie
- UX/Copy de-CH:
  - Toggle zeigt aktives Event im Label
  - Klarer Helper: “Nur ACTIVE + zugewiesen = in der App sichtbar.”
- MVP Guardrail:
  - Bei `status=ARCHIVED` wird Assignment immer entfernt

## Dateien / Änderungen
- `src/app/api/admin/v1/forms/route.ts` (List + Create, Filter, Option2-Assignment-Info)
- `src/app/api/admin/v1/forms/[id]/route.ts` (PATCH: Status + Assignment + Guardrail)
- `src/app/api/admin/v1/forms/[id]/duplicate/route.ts` (NEW: Duplicate)
- `src/app/(admin)/admin/forms/page.tsx` (de-CH Page)
- `src/app/(admin)/admin/forms/FormsScreenClient.tsx` (NEW: Finder-like List + Drawer)
- `docs/teilprojekt-5.2-setup-forms-ui-assignment.md` (diese Doku)

## Akzeptanzkriterien – Check ✅
- Liste lädt, Filter/Sort/Reset/Refresh funktionieren
- Drawer: Status-Update funktioniert
- Toggle setzt/entfernt Assignment zum aktiven Event (Option 2)
- Duplizieren erstellt DRAFT ohne Assignment
- Archivieren entfernt Assignment (Guardrail)
- Home Readiness wird “grün” sobald mind. 1 ACTIVE + assigned

## Tests / Proof (reproduzierbar)
### Lokal
- `npm run typecheck`
- `npm run lint`
- `npm run build`

### API (Beispiele)
- `GET /api/admin/v1/forms?status=ALL&assigned=ALL&sort=updatedAt&dir=desc`
- `PATCH /api/admin/v1/forms/:id` mit `{ "setAssignedToActiveEvent": true }`
- `PATCH /api/admin/v1/forms/:id` mit `{ "setAssignedToActiveEvent": false }`
- `POST /api/admin/v1/forms/:id/duplicate`
- `GET /api/admin/v1/home/summary` -> readiness item `ACTIVE_FORMS_ASSIGNED_TO_ACTIVE_EVENT` = OK

## Offene Punkte / Risiken
- Preview-Link führt aktuell auf Builder mit `?mode=preview` (falls Builder Query ignoriert, zeigt trotzdem Builder).
- Optional später: “Neues Formular” via Templates Flow (TP 4.8) statt Prompt.

## Next Step
- TP 5.3: Leads UI / Exporte / Geräte-Flow (je nach Roadmap)
