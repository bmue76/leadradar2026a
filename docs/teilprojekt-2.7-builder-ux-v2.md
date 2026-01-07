# Teilprojekt 2.7 — Builder UX v2 (Jotform-inspired)

Status: DONE ✅  
Datum: 2026-01-07  
Commit(s):
- 8808709
- 1be9255
- b3ac8ce

---

## Ziel

Den Builder von “Pane-first” auf einen **Canvas-first Builder** heben, damit das Form-Bauen schneller, intuitiver und messetauglicher wird:

- Field Cards im Zentrum (Canvas) mit Drag&Drop
- Klarer Flow: Build / Design / Publish
- Quick Actions direkt am Field (Hover-reveal)
- Vorbereitung für Undo/Delete/Autosave State (ohne Overengineering)

---

## Ergebnis

- `/admin/forms/[id]` bleibt der Einstieg; Builder ist stabil integriert.
- Builder v2 ist **Canvas-first**:
  - Field Cards im Zentrum
  - Drag&Drop Reorder direkt im Canvas
- Klarer Flow:
  - **Build**: Felder bauen (aktiv)
  - **Design**: Coming soon (Platzhalter, bewusst kein Scope)
  - **Publish**: Status-Step (MVP Publish Flow)
- Quick Actions am Field (Hover-reveal):
  - Duplicate / Delete / Required / Active
  - Drag Handle (nur bei Hover sichtbar)
- “Add Field” als Primary Action im Canvas:
  - am Ende + zwischen Cards (Hover “+ Add field”)
- Hook/State sauber verdrahtet:
  - Autosave/Save-State/Undo-Delete vorbereitet
  - typsicher (builderV2.types)

---

## Technik / Architektur

- v2 Komponenten/State sind getrennt und typsicher gehalten.
- Bestehende Admin Contracts werden weitergenutzt (keine neuen API Endpoints).
- Fokus auf Stabilität: keine Console Errors, konsistenter Selection/Draft Flow.

---

## Akzeptanzkriterien — Check

- ✅ Canvas-first Builder stabil unter `/admin/forms/[id]`
- ✅ Drag&Drop im Canvas funktioniert und persistiert (über bestehendes Reorder)
- ✅ Quick Actions (Duplicate/Delete/Required/Active) funktionieren erwartungsgemäß
- ✅ Build/Design/Publish Flow sichtbar; Design bewusst “Coming soon”
- ✅ Typecheck/Lint grün, keine Console Errors
- ✅ Nutzerfluss “Add field” klar und schnell

---

## Tests / Proof (reproduzierbar)

```bash
cd /d/dev/leadradar2026a

npm run typecheck
npm run lint
npm run build
npm run dev

# UI:
# /admin/forms -> Form öffnen -> Builder Tab
# - Add Field (Canvas)
# - Drag&Drop reorder (Canvas) + persist
# - Quick Actions: required/active toggle, duplicate, delete
# - Publish Step öffnen (MVP)
# - Reload -> Zustand konsistent, keine Errors
