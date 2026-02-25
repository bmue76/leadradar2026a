# Teilprojekt 7.10 — Events auswählen → Formulare auswählen (Multi-Event Assignments) + Mobile EventGate (0/1/n aktive Events)

Status: DONE (nach Push)  
Datum: 2026-02-24  
Commit(s): _FILL_AFTER_PUSH_ (z.B. abcd123, efgh456)

---

## Ziel

GoLive-MVP (ONLINE-only):

- Formular kann in mehreren Events eingesetzt werden (Many-to-Many via Join-Tabelle).
- Mobile Flow: License OK → 0/1/n aktive Events → EventGate/EventPicker → Formularauswahl → Capture.
- Device↔Form Assignments sind für Mobile Capture nicht mehr erforderlich (Mobile API filtert nicht darauf).
- Tenant-Scope non-negotiable: tenant-owned Zugriff strikt tenantId-scoped, leak-safe 404 bei falschem Tenant/ID.

---

## Umsetzung (Highlights)

### DB
- Join-Tabelle `EventFormAssignment` (tenantId, eventId, formId, createdAt).
- Unique: (tenantId, eventId, formId).
- Backfill: Forms mit legacy `assignedEventId != null` werden in Join-Tabelle übernommen.
- Legacy `Form.assignedEventId` bleibt als Mirror/Back-Compat (Quelle ist Join-Tabelle).

### API

#### Mobile
- `GET /api/mobile/v1/events/active` → liefert 0..n ACTIVE Events.
- `GET /api/mobile/v1/forms?eventId=...` → ACTIVE Forms, sichtbar für Event (Event-Assignment oder Global).
- `GET /api/mobile/v1/forms/:id?eventId=...` → leak-safe Sichtbarkeit pro Event.
- `POST /api/mobile/v1/leads` → nimmt `eventId` im Body; speichert `lead.eventId`.
- Device↔Form Assignments werden im Mobile Flow nicht mehr gefiltert.

#### Admin
- `GET /api/admin/v1/forms` → liefert `assignmentCount` + `assignedEventId` (nur wenn `assignmentCount===1`).
- `GET/PUT /api/admin/v1/forms/:id/assignments` → `eventIds[]`; `[]` bedeutet Global.
- `assigned` Query Param: deprecated/ignored (serverseitig toleriert).
- `PATCH /api/admin/v1/forms/:id` Legacy-Bridge: `setAssignedToEventId` wird in Join-Tabelle gespiegelt (scalar-only via Unchecked Update Input).

### UI

#### Admin `/admin/forms`
- Event-Auswahl in der Liste entfernt (UX vereinfachen).
- Drawer enthält:
  - Global Toggle (setzt eventIds = [])
  - Event Toggles (Multi-Select) für aktive Events
- Liste zeigt Sichtbarkeit: Global / Event / Mehrere (n).

#### Mobile
- Nach License OK: EventGate (0/1/n ACTIVE Events) → EventPicker (wenn >1) → Forms → Capture.
- Routing: Forms/Detail nutzen `eventId` Query Parameter.
- Storage: SecureStore `activeEventId` / `lastActiveEventId`.

---

## Dateien/Änderungen (final)

- `prisma/schema.prisma`
- `prisma/migrations/*` (Join-Tabelle + Backfill)
- `src/app/api/mobile/v1/events/active/route.ts`
- `src/app/api/mobile/v1/forms/route.ts`
- `src/app/api/mobile/v1/forms/[id]/route.ts`
- `src/app/api/mobile/v1/leads/route.ts`
- `src/app/api/admin/v1/forms/route.ts`
- `src/app/api/admin/v1/forms/[id]/route.ts`
- `src/app/api/admin/v1/forms/[id]/assignments/route.ts`
- `src/app/(admin)/admin/forms/FormsScreenClient.tsx`
- `apps/mobile/app/index.tsx`
- `apps/mobile/app/license.tsx`
- `apps/mobile/app/event-gate.tsx`
- `apps/mobile/app/events.tsx`
- `apps/mobile/app/forms/index.tsx`
- `apps/mobile/app/forms/[id].tsx`
- `apps/mobile/src/lib/eventStorage.ts`
- `docs/LeadRadar2026A/03_API.md`
- `docs/teilprojekt-7.10-events-forms-multi-assignments.md`

---

## Akzeptanzkriterien – Check

- [x] DB: Join-Tabelle `EventFormAssignment` vorhanden + Migration applied
- [x] DB: Backfill von legacy `Form.assignedEventId` → Join rows
- [x] API (Mobile): `/events/active` liefert 0..n ACTIVE Events
- [x] API (Mobile): `/forms?eventId=...` liefert event-/global-sichtbare ACTIVE Forms
- [x] API (Mobile): `/forms/:id?eventId=...` leak-safe, eventId Pflicht
- [x] API (Mobile): `POST /leads` speichert `lead.eventId` nach Event-Selection
- [x] API (Admin): `GET/PUT /forms/:id/assignments` funktioniert tenant-scoped + leak-safe
- [x] UI (Admin): Drawer Global + Multi-Event Auswahl stabil (kein “zurückspringen”)
- [x] UI (Mobile): 0/1/n Events Fälle funktionieren (Gate/Picker/Forms/Capture)
- [x] Security: alle tenant-owned Reads/Writes strikt tenantId-scoped; falscher Tenant/ID => 404
- [x] `npm run typecheck` → 0 Errors
- [x] `npm run lint` → 0 Errors (Warnings ok)
- [x] `npm run build` → grün
- [x] Docs aktualisiert + committed
- [ ] `git status` clean (nach Commit)
- [ ] Commit(s) gepusht, Hash(es) oben eingetragen

---

## Tests/Proof (reproduzierbar)

### curl — Mobile

1) Active Events (0..n)
```bash
curl -sS -H "x-api-key: $MOBILE_KEY" \
  "http://localhost:3000/api/mobile/v1/events/active" \
| python -m json.tool

Forms für Event

EVENT_ID="<EVENT_ID>"
curl -sS -H "x-api-key: $MOBILE_KEY" \
  "http://localhost:3000/api/mobile/v1/forms?eventId=$EVENT_ID" \
| python -m json.tool

Form Detail (eventId Pflicht)

FORM_ID="<FORM_ID>"
curl -sS -H "x-api-key: $MOBILE_KEY" \
  "http://localhost:3000/api/mobile/v1/forms/$FORM_ID?eventId=$EVENT_ID" \
| python -m json.tool

Lead erstellen (eventId Pflicht)

CLIENT_LEAD_ID="curl-$(date +%s)"
curl -sS -X POST \
  -H "content-type: application/json" \
  -H "x-api-key: $MOBILE_KEY" \
  -d "{
    \"eventId\":\"$EVENT_ID\",
    \"formId\":\"$FORM_ID\",
    \"clientLeadId\":\"$CLIENT_LEAD_ID\",
    \"capturedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"values\": {\"company\":\"ACME\",\"email\":\"test@acme.ch\"}
  }" \
  "http://localhost:3000/api/mobile/v1/leads" \
| python -m json.tool
curl — Admin Assignments
USER_ID="<ADMIN_USER_ID>"
FORM_ID="<FORM_ID>"
EVENT1="<EVENT_ID_1>"
EVENT2="<EVENT_ID_2>"

curl -sS -H "x-tenant-slug: demo" -H "x-user-id: $USER_ID" \
  "http://localhost:3000/api/admin/v1/forms/$FORM_ID/assignments" \
| python -m json.tool

curl -sS -X PUT -H "content-type: application/json" -H "x-tenant-slug: demo" -H "x-user-id: $USER_ID" \
  -d "{\"eventIds\":[\"$EVENT1\",\"$EVENT2\"]}" \
  "http://localhost:3000/api/admin/v1/forms/$FORM_ID/assignments" \
| python -m json.tool

# Global setzen
curl -sS -X PUT -H "content-type: application/json" -H "x-tenant-slug: demo" -H "x-user-id: $USER_ID" \
  -d "{\"eventIds\":[]}" \
  "http://localhost:3000/api/admin/v1/forms/$FORM_ID/assignments" \
| python -m json.tool
App — Manual

Start → License OK → EventGate

0 Events: Info Screen „Keine aktive Messe“

1 Event: Auto-select → Forms

1 Events: Event Picker → Forms

Capture → Lead senden → OK

Offene Punkte/Risiken (P0/P1/…)

P1: Readiness Kontext ist best-effort (default zuletzt aktualisiertes ACTIVE Event).

P1: Legacy Form.assignedEventId ist Mirror/Back-Compat, nicht authoritative.

P1: Drawer listet aktuell nur ACTIVE Events (MVP). DRAFT/ARCHIVED optional später.

Next Step

TP 7.11 (optional Cleanup): Legacy assignedEventId writes minimieren/entfernen; Device.activeEventId endgültig deprecaten; KPIs/Reports auf Join-Tabelle normalisieren.
