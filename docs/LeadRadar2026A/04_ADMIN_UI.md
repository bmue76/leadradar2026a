# LeadRadar2026A – Admin UI Screens

Stand: 2026-01-13  
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

## Screen: Mobile Ops (`/admin/settings/mobile`) — TP 2.9 + TP 3.0 + TP 3.1 (+ TP 3.7)

Ziel:
- Mobile API Betrieb produktfähig machen:
  - ApiKeys listen / erstellen (one-time token) / revoke
  - Devices listen / verwalten (rename, enable/disable)
  - Assignments (Device ↔ Forms) per Replace-Strategy pflegen
  - Provisioning: Token + Claim Flow (single-use hardened, best-effort RL)
  - Demo Capture Key UX (DEV)

TP 3.7 Guardrails (UX):
- Active Event Dropdown zeigt nur ACTIVE Events (+ “Kein Event”).
- Wenn kein ACTIVE Event existiert: Hinweis “Kein aktives Event – Leads werden ohne Event gespeichert.”
- Wenn versucht wird, ein nicht-ACTIVE Event zu binden: API liefert 409 `EVENT_NOT_ACTIVE`.
