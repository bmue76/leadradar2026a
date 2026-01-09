# LeadRadar2026A – Admin UI Screens

Stand: 2026-01-09  
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
  - `Chip` (ruhige Status-Chips)
  - `EmptyState` (Icon + 1 Satz + 1 CTA)

Global Admin-Prinzipien:
- Weißraum statt Linien
- Typografie statt Boxen
- Pro Screen 1 Primary Action
- Errors zeigen Trace + Retry

---

## Screen: Forms (`/admin/forms`) — TP 1.3 + TP 2.2

Ziel:
- Forms auflisten, filtern, öffnen
- Primary CTA: Form erstellen

UX Notes:
- Toolbar: Search + Status Filter + Clear + Refresh
- Table: Finder-like, Actions (Open) nur bei Hover/Focus
- Empty: “No forms yet.” + Primary CTA
- Error: “Couldn’t load forms.” + Trace + Retry

---

## Screen: Leads (`/admin/leads`) — TP 1.7 + TP 2.2

Ziel:
- Leads in ruhiger Tabelle anzeigen
- Row öffnet Detail (Drawer)
- Pagination über “Load more”

UX Notes:
- Table: Finder-like
- Status: Chip (Active/Deleted) ruhig
- Footer: “Load more” Secondary

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

UX Notes:
- Primary CTA: “Create export”
- Secondary/Ghost: “Refresh”
- Table: Finder-like
- Status: Chip (QUEUED/RUNNING/DONE/FAILED)
- Empty: “No exports yet.” + Primary CTA
- Error: “Couldn’t load exports.” + Trace + Retry

---

## Screen: Mobile Ops (`/admin/settings/mobile`) — TP 2.9 + TP 3.0 + TP 3.1

Ziel:
- Mobile API Betrieb produktfähig machen:
  - ApiKeys listen / erstellen (one-time token) / revoke
  - Devices listen / verwalten (rename, enable/disable)
  - Assignments (Device ↔ Forms) per Replace-Strategy pflegen
  - Provisioning: Token + Claim Flow (single-use hardened, best-effort RL)
  - Demo Capture Key UX (DEV)

### UI Struktur (MVP)

#### 1) Section “Provisioning”
- CTA: “Create token”
- Create Modal:
  - Requested DeviceName (optional)
  - Expires (Minutes, clamp 5…240, default 30)
  - Initial Assignments (ACTIVE forms checklist, optional)
- Success:
  - One-time Token Anzeige + Copy
  - QR (DEV): Link zu `/admin/demo/provision?token=...`
- Table:
  - Prefix | Status (ACTIVE/USED/REVOKED/EXPIRED) | Expires | Used | Device | Created | Actions
  - Actions: “Revoke” **nur** wenn Status ACTIVE (sonst disabled)

Hinweis:
- `EXPIRED` wird API-seitig computed angezeigt, obwohl DB-status weiterhin `ACTIVE` sein kann.
- Revoke ist nur erlaubt, wenn der Token effektiv ACTIVE und nicht expired ist (sonst 409 INVALID_STATE).

#### 2) Section “ApiKeys”
- Table: Prefix | Name | Status | Last used | Created | Actions (Revoke)
- CTA: “Create key”
- Create Success: One-time token Anzeige + Copy + “Use for Demo Capture” (setzt localStorage und navigiert)

#### 3) Section “Devices”
- Table: Name | Status | Last seen | Last used | Assigned | ApiKey prefix | Actions (Manage)
- Manage Drawer:
  - Rename + Status
  - Assignments: Checklist (default ACTIVE), optional Toggle “Show drafts/archived”
  - Save Assignments (Replace)

#### 4) Demo Shortcuts (DEV)
- Links:
  - “Open Demo Capture” (`/admin/demo/capture`)
  - “Open Demo Provision” (`/admin/demo/provision`)

---

## Screen: Demo Provision (`/admin/demo/provision`) — DEV-only

Ziel:
- Provision Token claimen, ohne Mobile-App
- Nach Claim wird `leadradar.devMobileApiKey` (und legacy key) in localStorage geschrieben
- Redirect zu `/admin/demo/capture`

UX Notes:
- Token Input (oder `?token=...`)
- Button “Claim token”
- Error: ruhige Meldung + traceId

---

## Screen: /login (Apple-clean)

- Minimal: Wordmark/Logo + Email + Password + Primary CTA “Sign in”
- Keine Cards, keine Schatten
- Error: ruhig (kleiner Text)
- Nach Login: Redirect `/admin`
- Topbar rechts: User Menu + Logout
