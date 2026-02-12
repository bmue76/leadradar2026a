# Schlussrapport — Teilprojekt 6.10: Events → Multi-ACTIVE (Capture Context per Device) + Home Summary Aggregation (GoLive MVP)

Status: DONE ✅  
Datum: 2026-02-12  
Commit(s):
- feat(tp6.10): home summary multi-active aggregation
- fix(tp6.10): event guardrails multi-active + prefer-const

## Ziel

GoLive-MVP: **Mehrere Events dürfen gleichzeitig ACTIVE sein** (Multi-ACTIVE).  
Der **Capture-Kontext** wird **pro Gerät** über `MobileDevice.activeEventId` bestimmt.  
Admin-Übersichten (Home/Leads) sollen **über alle ACTIVE Events aggregieren**.

## Scope / Änderungen

### 1) Datenmodell / Guardrails

- **Multi-ACTIVE erlaubt**: es gibt keinen “Single ACTIVE” Zwang mehr.
- `setEventStatusWithGuards`:
  - Statuswechsel bleibt tenant-scoped und leak-safe.
  - Bei Wechsel auf **nicht ACTIVE** (`DRAFT`/`ARCHIVED`) werden Devices, die auf dieses Event zeigen, **ops-safe unbound** (`activeEventId=null`).
  - **Kein** Auto-Archive von “anderen ACTIVE Events” mehr (Multi-ACTIVE).

### 2) Mobile API (Capture Context: per Device)

**Single Source of Truth**: `mobileDevice.activeEventId`

- `GET /api/mobile/v1/forms`
  - Wenn Device **nicht gebunden** oder gebundenes Event **nicht ACTIVE** ⇒ `[]`
  - Sonst: nur Formulare, die
    - dem Device zugewiesen sind (`MobileDeviceForm`)
    - **ACTIVE** sind
    - und `assignedEventId === device.activeEventId`

- `POST /api/mobile/v1/leads`
  - Leak-safe 404, wenn Device nicht gebunden oder Event nicht ACTIVE
  - Require Assignment (Device↔Form) + Form ACTIVE + Form assigned to device event
  - Lead wird mit `eventId = device.activeEventId` persistiert

- `GET /api/mobile/v1/events/active`
  - Liefert `activeEvent=null`, wenn Device nicht gebunden oder Event nicht ACTIVE
  - Sonst Details des gebundenen ACTIVE Events

### 3) Admin API (Aggregation über ACTIVE Events)

- `GET /api/admin/v1/home/summary`
  - `activeEvent` bleibt backward-compat (primary = “neuester” ACTIVE)
  - Readiness/KPIs werden **über alle ACTIVE Events** aggregiert (Option-2 Filter via `form.assignedEventId in activeIds`, Leads via `eventId in activeIds`)

- `GET /api/admin/v1/leads`
  - `event=ACTIVE` ohne `eventId` ⇒ Filter über **alle ACTIVE** (`eventId in activeEventIds`)
  - Falls keine ACTIVE Events ⇒ leere Liste (predictable)

- `src/app/api/admin/v1/events/_repo.ts`
  - `getActiveOverview` liefert:
    - `activeEvent` (primary, backward-compat)
    - `activeEvents` (alle ACTIVE)
    - `counts` aggregiert über alle ACTIVE (assignedActiveForms, boundDevices)

## Akzeptanzkriterien (erfüllt)

- Mehrere Events können gleichzeitig `ACTIVE` sein.
- Mobile Capture hängt ausschließlich vom Device-Binding (`activeEventId`) ab.
- Mobile liefert keine Formulare/Lead-Capture, wenn Device unbound oder Event nicht ACTIVE (leak-safe).
- Admin Home Summary & Leads Liste funktionieren mit Multi-ACTIVE (aggregation).
- `npm run lint`, `npm run typecheck`, `npm run build` sind grün.

## Proof / Checks

- Lint/TS/Build:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`

- Manual sanity:
  - 2 Events auf ACTIVE setzen
  - Device A auf Event 1 binden ⇒ Mobile zeigt nur Forms/Event 1
  - Device B auf Event 2 binden ⇒ Mobile zeigt nur Forms/Event 2
  - Admin Home: readiness/kpis aggregieren über beide ACTIVE
  - Admin Leads (event=ACTIVE): zeigt Leads beider Events

## Notizen / Risiken

- “Primary activeEvent” ist nur für backward-compat/UI-Teile gedacht. Die echte Wahrheit ist `activeEvents[]` + Device Binding.
- Wenn ein Event archiviert wird: Devices werden unbound ⇒ Mobile sieht “kein aktives Event”.

## Nächste Schritte (Reihenfolge)

1) UI/UX: Admin Events Screen (Aktivieren/Archivieren) kurz prüfen, dass “Aktivieren” keine anderen Events deaktiviert (Multi-ACTIVE).
2) Doku-Index ergänzen.
