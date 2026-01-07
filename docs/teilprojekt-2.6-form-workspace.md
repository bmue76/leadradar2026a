# Teilprojekt 2.6 — Form Workspace (Tabs + integrierter Builder + Drag&Drop Reorder)

Status: DONE ✅  
Datum: 2026-01-07  
Commit(s):
- TODO: <hash> <message> (TP 2.6 Commits aus `git log --oneline` ergänzen)

---

## Ziel

- Builder-Funktionalität aus `/admin/forms/[id]/builder` direkt in `/admin/forms/[id]` integrieren, um Kontextwechsel zu vermeiden.
- Editor als klarer Workspace im Form-Detail verfügbar machen (Tab-basiert).

---

## Ergebnis

- `/admin/forms/[id]` besitzt Tabs: **Overview / Builder**
- Builder als **3-Pane Workspace**:
  - **Links:** Fields-Liste (Type / Required / Active) + Add + **Drag&Drop Reorder**
  - **Mitte:** Preview (aktive Felder)
  - **Rechts:** Properties
    - Label, Key, Type
    - Required, Active
    - Placeholder, HelpText
    - Options (für option-basierte Types)
    - Checkbox Default (für boolean)
- `/admin/forms/[id]/builder` bleibt als Alias / Tab-Start bestehen (kein Broken Link, kompatibel zu bestehenden Deep Links).
- Next.js 16 params-Promise Fix umgesetzt (kein Runtime-Error mehr).

---

## Technik / Architektur

- Zentraler Hook: **`useFormDetail()`**
  - Load/Refresh (Form + Fields)
  - Selection + Draft State
  - Create/Save Field
  - Reorder + Persist (über bestehende Reorder-API)
- **Keine neuen API Endpoints**: Nutzung der bestehenden Admin Contracts (TP 1.1/1.4).

---

## Akzeptanzkriterien — Check

- ✅ Builder ist direkt in `/admin/forms/[id]` integriert (Tab)
- ✅ Drag&Drop Reorder funktioniert, Speichern persistiert Reihenfolge
- ✅ Properties Panel speichert Änderungen korrekt
- ✅ Alias-Route `/admin/forms/[id]/builder` funktioniert weiterhin
- ✅ Next.js 16 params/searchParams-Promise Issues behoben (stabil)
- ✅ `npm run typecheck` grün
- ✅ `npm run lint` grün (Warnings ok)
- ✅ Manuelle Smoke Tests ohne Console Errors

---

## Tests / Proof (reproduzierbar)

```bash
cd /d/dev/leadradar2026a

npm run typecheck
npm run lint
npm run build
npm run dev

# UI:
# /admin/forms -> Form öffnen -> Tab "Builder"
# - Field erstellen/speichern
# - Drag&Drop reorder + Save order
# - Reload -> Reihenfolge bleibt
# - Properties ändern -> Save -> Preview reflektiert
# - /admin/forms/[id]/builder öffnet Builder Tab (Alias)

