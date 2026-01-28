# LeadRadar2026A – Admin UI Screens

Stand: 2026-01-27  
Design: Apple-clean (reduziert, robust, klare States).  
Referenzen: **SumUp (Listen/Filter)** · **Square (Dashboard/Progress/Akzent)** · **Jotform (Builder Mode)**.

---

## Admin UI Design-Leitplanken (v1)

**One-liner (verbindlich):**  
LeadRadar Admin UI orientiert sich strukturell an SumUp, im Dashboard an Square und im Formbuilder an Jotform – mit maximaler Ruhe, wenig Farbe und klarer Trennung von Navigation und Workspace.

### Non-negotiables
- **Listen first, Details second**: primär Listen/Tables; Details per Klick (Detailseite oder Drawer).
- **Navigation ≠ Workspace**:
  - Sidebar navigiert zwischen Domänen.
  - Workspaces (Editoren) dürfen eigenen Modus haben (Builder Mode).
- **Farbe ist funktional**:
  - 1 Akzentfarbe (Tenant-Accent möglich), nur für Primary CTA, aktive Navigation, Selection/Progress.
  - Keine bunten Icons/Flächen ohne Bedeutung.
- **Ruhe schlägt Dekoration**:
  - Weißraum statt Rahmen/Schatten.
  - Linien nur dort, wo sie Orientierung schaffen.
  - States sind Pflicht: Loading (Skeleton), Empty (1 Satz + 1 CTA), Error (TraceId + Retry).

### Standard Screen Pattern (immer gleich)
1) Title + 1 Zeile Hilfe  
2) Toolbar: Search, Filter, Clear, Refresh  
3) List/Table: Finder-like, ruhige Rows, Actions nur bei Hover/Focus  
4) Detail: Seite oder Drawer (kontextabhängig)

---

## Design System light (TP 2.2)

Quelle (Spec):
- `docs/LeadRadar2026A/06_UX_SPEC.md`

Technik:
- Tokens: `src/app/(admin)/admin/_styles/tokens.css`
- UI-Basics: `src/app/(admin)/admin/_ui/`
  - `Table` (Finder-like: ohne Gridlines/Rahmen, Row Hover, Actions nur bei Hover/Focus)
  - `Button` (Primary/Secondary/Ghost; Primary = Tenant Accent / LeadRadar default)
  - `Chip` (ruhige Status-Chips)
  - `EmptyState` (Icon + 1 Satz + 1 CTA)

Global Admin-Prinzipien:
- Weißraum statt Linien
- Typografie statt Boxen
- Pro Screen 1 Primary Action
- Errors zeigen Trace + Retry

---

## Sidebar (Backend)

Ziel: ruhig, konsistent, nicht dominant.

Empfohlene Gruppen (MVP):
- Home: Dashboard
- Setup: Templates, Forms
- Operate: Leads, Exports, Recipients
- Billing: Packages, Orders, Licenses
- Admin: Users, Settings

Phase 2 (visible, disabled):
- Analytics: KPIs
- Ops & Security: Audit, Support
- Offline: Sync

---

## Screen: Dashboard (`/admin/dashboard`) — Square-Style (Orientierung)

Ziel:
- Orientierung, kein KPI-Monster
- “Readiness” sichtbar machen

Inhalt (MVP):
- Setup/Readiness Cards:
  - “Form active”
  - “Active event”
  - “License valid”
  - “Devices online”
- Kleine Kennzahlen (Sekundär): Leads heute, pending uploads
- Quick actions: Create form, Open active event, Create export

States:
- Loading skeleton
- Empty: “No data yet.” + CTA
- Error: TraceId + Retry

---

## Screen: Templates (`/admin/templates`) — TP 4.x

Ziel:
- Templates browsen/previewen
- “Create form from template”

UX Notes:
- List/Table, Search, Category Filter
- Preview (Drawer oder separate Detailseite)
- Primary CTA: “Create from template”

---

## Screen: Forms (`/admin/forms`) — TP 1.3 + TP 2.2

Ziel:
- Forms auflisten, filtern, öffnen
- Primary CTA: Form erstellen

UX Notes (Soll-Zustand):
- Toolbar: Search + Status Filter + Clear + Refresh
- Table: Finder-like, Actions (Open/Builder/Duplicate) nur bei Hover/Focus
- Row: Name, Description (optional), Status Chip, Updated
- Empty: “No forms yet.” + Primary CTA
- Error: “Couldn’t load forms.” + Trace + Retry

### Challenge: aktueller `/admin/forms` Screen (gegen Leitplanken)

Basierend auf dem aktuellen Screenshot:
- **Doppelte Überschrift** (“Forms” im Header + nochmals “Forms” als H1) → **reduzieren auf 1**.
- **Template-Controls dominieren** (Reload templates / Choose template / Create from template) → gehören als **sekundäre Aktion** in die Toolbar oder in ein **„Create“ Dropdown/Modal**, nicht als eigener “Block” oben.
- **Zu viel vertikale Fläche** für “Meta-Header” (Demo Admin, Logo, etc.) → Header sollte ruhig bleiben; Inhalt soll dominieren.
- **Liste wirkt wie Card-Stack** → besser: **Finder-like Table** (SumUp-Pattern), damit Scanbarkeit steigt.
- **Primary CTA** “Create form” ok, aber: nur 1 Primary CTA pro Screen → “Create from template” sollte Secondary/Ghost oder in “Create” Menü.

Konkreter Soll-Aufbau:
1) Title + 1 Satz Hilfe (einmal)
2) Toolbar:
   - Search
   - Status Filter
   - (Optional) Template Dropdown + “Create from template” (Secondary)
   - Refresh (Ghost)
   - Primary: “Create form”
3) Table/List:
   - Name
   - Status chip
   - Updated
   - Actions nur bei Hover/Focus

---

## Screen: Form Overview (`/admin/forms/:id`) — ruhig, verwaltend

Ziel:
- Meta-Infos (Name, Beschreibung, Status)
- Links in den Builder
- Keine Feld-Bearbeitung “zwischen Tür und Angel”

UX Notes:
- Primary CTA: “Open Builder”
- Secondary: Duplicate, Delete
- Status Toggle sichtbar (DRAFT/ACTIVE/ARCHIVED)

---

## Screen: Form Builder (`/admin/forms/:id/builder`) — Builder Mode (Jotform-lite)

Ziel:
- Benutzerfreundliches Drag & Drop Formbuilding (Canvas-first)

Verbindliches Konzept:
- **Builder Mode** = eigener Arbeitsmodus
- Globale Sidebar im Builder:
  - minimiert (Icons only) ODER gedimmt
- Workspace Layout:
  1) Feldbibliothek (links)
  2) Canvas (mitte) – Single Source of Truth
  3) Properties (rechts) – kontextabhängig

MVP Features:
- Drag & Drop: Add aus Bibliothek + Reorder im Canvas
- Drop-Indicator sichtbar
- Select Feld → Properties rechts
- Actions am Feld (ruhig): Duplicate / Delete / Active toggle

Nicht im MVP:
- Mehrspaltig
- Pages/Steps
- Conditional Logic
- Theme Builder

OCR-Felder:
- als Systemfelder kennzeichnen
- Policy: nicht frei löschbar (ggf. label/required eingeschränkt)

---

## Screen: Leads (`/admin/leads`) — TP 1.7 + TP 2.2 (+ TP 3.5 Attachments)

Ziel:
- Leads in ruhiger Tabelle anzeigen
- Row öffnet Detail (Drawer)
- Pagination über “Load more”
- Attachments anzeigen + Download (TP 3.5)

UX Notes:
- Table: Finder-like
- Status: Chip (Active/Deleted) ruhig
- Footer: “Load more” Secondary

### Lead Detail Drawer

Sektionen:
1) Header: capturedAt, Form, Status, LeadId
2) Actions: Delete / Restore (Restore optional)
3) Values: Key/Value Grid
4) Attachments (TP 3.5)

## B) `docs/LeadRadar2026A/04_ADMIN_UI.md` – Ergänzung (Lead Drawer OCR Panel)

👉 In `04_ADMIN_UI.md` im Bereich **Lead Detail Drawer** (oder direkt unter “Leads”) diesen Block ergänzen:

```md
### Lead Detail Drawer — OCR Review Panel (TP 4.11)

Ziel:
- Business-Card OCR direkt im Lead Drawer reviewen
- Korrektur speichern (correctedContactJson)
- Apply schreibt contact_* Felder am Lead (stable export columns)

UI Bestandteile:
- Status Pill: Pending / Completed / Failed
- Engine Meta: engine, version, mode, confidence
- Attachment Preview (inline) + Download
- Raw Text (Expand/Collapse)
- Editable Contact Form (parsed/corrected)
  - Reset: setzt Draft auf correctedContact (fallback parsedContact)
  - Save: PATCH `/api/admin/v1/leads/:id/ocr`
  - Apply: POST `/api/admin/v1/leads/:id/ocr/apply` (nur wenn status=COMPLETED)

States:
- Kein Attachment: „No business card image attachment found…“
- Attachment da, OCR null: „No OCR result yet. Try Reload.“
- Loading: „Loading…“
- Error: zeigt traceId + Copy + Retry/Reload

Guardrails:
- Save nur aktiv, wenn Draft geändert (dirty)
- Apply nur wenn OCR status=COMPLETED
- Busy States disable Reload/Save/Apply während Requests laufen

#### Attachments Section (TP 3.5)
- Zeigt Liste von Attachments (filename, type, mimeType, size)
- Für `BUSINESS_CARD_IMAGE` und `image/*`:
  - Preview/Thumbnail via `?inline=1` Download-Endpoint
- Pro Attachment: Action “Download”
- Empty state: “No attachments.”

API Wiring:
- Download: `GET /api/admin/v1/leads/:id/attachments/:attachmentId/download`
  - optional `?inline=1` für Preview (nur image/*)
- Browser nutzt Session Cookie für Auth (weil `<img>` keine custom headers mitsendet)

---

## Screen: Exports (`/admin/exports`) — TP 1.8 + TP 2.2 + TP 3.4

Ziel:
- Admin kann CSV Export (Leads) starten
- Jobs sehen (Status + Zeitstempel)
- Download sobald DONE
- Fehlerstates zeigen Trace + Retry
- (TP 3.4) Event-aware: Export optional nach Event filtern

API Wiring:
- Create: `POST /api/admin/v1/exports/csv`
- List: `GET /api/admin/v1/exports?type=CSV`
- Status: `GET /api/admin/v1/exports/:id` (Polling)
- Download: `GET /api/admin/v1/exports/:id/download`
- Event list (Dropdown): `GET /api/admin/v1/events?status=ACTIVE`

Export Create Modal (TP 3.4):
- Event (optional): Dropdown (ACTIVE events)
- Form (optional): Dropdown (falls vorhanden)
- Date range (from/to): optional
- Include deleted: optional

Jobs Table (TP 3.4):
- Zeigt Filter Summary in Meta-Line, z.B.
  - `Event: Swissbau 2026 · Form: Demo Lead Capture · Range: 2026-01-09 → 2026-01-10`

UX Notes:
- Primary CTA: “Create export”
- Secondary/Ghost: “Refresh”
- Table: Finder-like
- Status: Chip (QUEUED/RUNNING/DONE/FAILED)
- Empty: “No exports yet.” + Primary CTA
- Error: “Couldn’t load exports.” + Trace + Retry

---

## Screen: Recipients (`/admin/recipients`) — MVP

Ziel:
- Recipient Lists + Entries verwalten (für Export/Forwarding)

UX Notes:
- List der Listen (Name, count, updated)
- Detailseite/List Drawer für Entries
- Primary CTA: “Create list”

---

## Screen: Billing – Packages/Orders/Licenses (`/admin/billing/*`) — MVP

Ziel:
- Kauf-/Lizenz-Workflow administrierbar machen (MVP: DEV mark-paid; später Stripe)

Screens:
- `/admin/billing/packages` – Pakete (30/365), Auswahl + Buy
- `/admin/billing/orders` – Orders, pending/paid, mark-paid (DEV)
- `/admin/billing/licenses` – License Keys, expiresAt, device binding, revoke

UX Notes:
- Tabellen/Listen, Status Chips, klare Primary CTA pro Screen
- Keine “Payment UI” im MVP, nur Workflow-Transparenz

---

## Screen: Events (`/admin/events`) — TP 3.3 + TP 3.7 + TP 3.8

Ziel:
- Events auflisten, Status setzen (ACTIVE/ARCHIVED)
- Guardrail sichtbar machen: nur 1 ACTIVE Event pro Tenant (MVP)
- Ops-Transparenz: zeigt Anzahl gebundener Devices pro Event

TP 3.7 Guardrails (UX):
- Hinweistext: “Nur ein aktives Event pro Tenant. Aktivieren archiviert das bisher aktive Event (und unbindet Devices).”
- Actions (minimal): pro Event “Activate” oder “Archive”
- Optional Ops Action: “Devices lösen” (setzt `device.activeEventId=null`)
- Nach Statuswechsel kurze Notice (best-effort)

TP 3.8 Ops Polish:
- Tabelle zeigt eine zusätzliche Spalte “Devices”:
  - `boundDevicesCount` (Count von `MobileDevice.activeEventId == eventId`)
  - Nur Count (kein heavy Join)

API Wiring:
- List: `GET /api/admin/v1/events?limit=200&status=...&includeCounts=true`
- Status Change: `PATCH /api/admin/v1/events/:id/status` (TP 3.7: Auto-archive + Auto-unbind)
- Optional Ops: `POST /api/admin/v1/events/:id/unbind-devices`

---

## Screen: Mobile Ops (`/admin/settings/mobile`) — TP 2.9 + TP 3.0 + TP 3.1 (+ TP 3.7 + TP 3.9)

Ziel:
- Mobile API Betrieb produktfähig machen:
  - ApiKeys listen / erstellen (one-time token) / revoke
  - Devices listen / verwalten (rename, enable/disable)
  - Assignments (Device ↔ Forms) per Replace-Strategy pflegen
  - Provisioning: Token + Claim Flow (single-use hardened, best-effort RL)
  - Demo Capture Key UX (DEV)

TP 3.7 Guardrails (UX):
- Device Binding akzeptiert `activeEventId = null` (Leads ohne Event)
- Wenn versucht wird, ein nicht-ACTIVE Event zu binden: API liefert 409 `EVENT_NOT_ACTIVE`.

TP 3.9 Konsistenz: Active Event Single Source + Hint States
- Mobile Ops verwendet nicht mehr eine Event-Liste, sondern `/api/admin/v1/events/active` als Single Source.
- Active Event “Dropdown” ist effektiv 2 Optionen:
  - “Kein Event” → setzt `activeEventId = null`
  - “<Aktives Event>” → setzt `activeEventId = <activeEvent.id>`
- State Machine (im Manage Device Drawer):
  - loading: “Loading active event…”
  - none: neutraler Hinweis “Kein aktives Event – Leads werden ohne Event gespeichert.” + Link zu `/admin/events`
  - error: Callout mit `traceId` + “Retry”
- Edge Case (Ops Hint):
  - Wenn ein Device noch auf ein nicht-aktives Event gebunden ist, wird dies als Warn-Option angezeigt:
    - “⚠︎ bound to non-ACTIVE event (evt_…)”

---

## Screen: Users (`/admin/users`) — MVP

Ziel:
- Tenant-User anzeigen/rollenbasiert verwalten (Owner/Admin minimal)

UX Notes:
- Liste + Detail (Drawer)
- Primary CTA: “Invite user” (später), im MVP ggf. read-only

---

## Screen: Settings (`/admin/settings`) — MVP

Ziel:
- Tenant Settings bündeln: Branding, Limits, Security, Mobile Hinweise

Empfohlene Sektionen:
- General (Tenant Name, Slug read-only)
- Branding (Accent color, Logo)
- Data/Retention (Retention days, Export TTL)
- Mobile (Info, Links zu Mobile Ops)
- Security (Owner-only, audit hooks später)

