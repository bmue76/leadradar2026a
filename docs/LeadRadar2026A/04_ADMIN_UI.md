# LeadRadar2026A – Admin UI Screens

Stand: 2026-01-06  
Design: Apple-clean (reduziert, robust, klare States) — Notion-Elemente nur wo nötig.

---

## Design System light (TP 2.2)

Ziel: Konsistente, ruhige Admin-UI ohne neue Features.

Quelle (Spec):
- `docs/LeadRadar2026A/06_UX_SPEC.md`

Technik:
- Tokens: `src/app/(admin)/admin/_styles/tokens.css`
- UI-Basics: `src/app/(admin)/admin/_ui/`
  - `Table` (Finder-like: ohne Gridlines/Rahmen, Row Hover, Actions nur bei Hover/Focus)
  - `Button` (Primary/Secondary/Ghost; Primary = LeadRadar Rot)
  - `Chip` (ruhige Status-Chips, keine bunten Ampel-Farben)
  - `EmptyState` (Icon + 1 Satz + 1 CTA)

Global Admin-Prinzipien:
- Weißraum statt Linien
- Typografie statt Boxen
- Pro Screen 1 Primary Action
- Keine Card-Schatten, kein „Admin-Grau“ als Grundfläche
- Errors zeigen Trace + Retry

---

## Screen: Forms (`/admin/forms`) — TP 1.3 + TP 2.2

Ziel:
- Forms auflisten, filtern, öffnen
- Primary CTA: Form erstellen

UX Notes (Apple-clean):
- Toolbar: Search + Status Filter + Clear (Ghost) + Refresh (Ghost)
- Table: Finder-like, Actions (Open) nur bei Hover/Focus
- Empty: Icon + “No forms yet.” + Primary CTA “Create form”
- Error: “Couldn’t load forms.” + Trace + Retry

---

## Screen: Leads (`/admin/leads`) — TP 1.7 + TP 2.2

Ziel:
- Leads in einer ruhigen Tabelle anzeigen
- Row öffnet Detail (Drawer)
- Pagination über “Load more”

UX Notes (Apple-clean):
- Table: Finder-like, Actions (Open) nur bei Hover/Focus
- Status: Chip (Active/Deleted) ruhig, nicht bunt/rot
- Footer: “Load more” als Secondary (ruhig, kein Primary)

---

## Screen: Exports (`/admin/exports`) — TP 1.8 + TP 2.2

Ziel:
- Admin kann CSV Export (Leads) starten
- Jobs sehen (Status + Zeitstempel)
- Download sobald DONE
- Fehlerstates zeigen Trace + Retry

API Wiring:
- Create: `POST /api/admin/v1/exports/csv`
- List: `GET /api/admin/v1/exports?type=CSV`
- Status: `GET /api/admin/v1/exports/:id` (Polling)
- Download: `GET /api/admin/v1/exports/:id/download`

UX Notes (Apple-clean):
- Primary CTA: “Create export”
- Secondary/Ghost: “Refresh”
- Table: Finder-like, Actions (Poll/Download) nur bei Hover/Focus
- Status: Chip (QUEUED/RUNNING/DONE/FAILED) ruhig, ohne Ampel-Farben
- Empty: “No exports yet.” + Primary CTA
- Error: “Couldn’t load exports.” + Trace + Retry

Dev Tenant Context:
- `x-tenant-slug` Header (curl)
- UI: optional localStorage helper `leadradar.devTenantSlug` oder `DEV_TENANT_SLUG` env

---

## Screen: /login (Apple-clean)

- Minimal: Wordmark/Logo + Email + Password + Primary CTA “Sign in”
- Keine Cards, keine Schatten, keine Admin-Grau-Flächen
- Error: ruhig (kleiner Text, keine roten Banner)
- Nach Login: Redirect `/admin`
- Topbar rechts: User Menu (Name/Email) + Logout
