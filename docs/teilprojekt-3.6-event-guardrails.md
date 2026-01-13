# Schlussrapport — Teilprojekt 3.6: Event Guardrails (ACTIVE Regeln + Device Auto-Unbind + Ops Safety) — ONLINE-only (MVP)

Status: IN PROGRESS ⏳  
Datum: 2026-01-12  
Commits (main): TBD

## Ziel

Messebetrieb absichern durch Guardrails, damit Leads zuverlässig dem richtigen Event zugeordnet werden:

A) Max. 1 ACTIVE Event pro Tenant (MVP, auto-archive)  
B) Device.activeEventId darf nur auf ACTIVE Event zeigen (409 EVENT_NOT_ACTIVE)  
C) Beim Archive/Draft eines Events: Devices werden automatisch unbound (activeEventId=null)  
D) Admin UX Hinweise / sichere Defaults

## Umsetzung (Highlights)

### 1) Guardrail 1 — Max 1 ACTIVE Event pro Tenant (Auto-archive)
Route: `PATCH /api/admin/v1/events/:id/status`

- Wenn status=ACTIVE:
  - anderes ACTIVE Event (tenant-scoped) wird automatisch ARCHIVED
  - Devices, die auf das vorherige ACTIVE Event gebunden waren, werden auto-unbound (`activeEventId=null`)
- Wenn status != ACTIVE (DRAFT/ARCHIVED):
  - Devices mit `activeEventId=thisEvent` werden auto-unbound

Implementation: `prisma.$transaction` für atomare Updates (Event-Status + Device-unbind).

### 2) Guardrail 2 — Device Binding nur auf ACTIVE Events
Route: `PATCH /api/admin/v1/mobile/devices/:id`

- `activeEventId`:
  - unknown/foreign tenant => 404 NOT_FOUND (leak-safe)
  - known but not ACTIVE => 409 EVENT_NOT_ACTIVE
  - null => clear binding

### 3) Admin UI (Events)
Screen: `/admin/events`
- Minimal Actions: Activate / Archive pro Row
- Hinweistext: “Nur ein aktives Event pro Tenant. Aktivieren archiviert das bisher aktive Event (und unbindet Devices).”
- Best-effort Notice nach Statuswechsel

### 4) Docs
- `docs/LeadRadar2026A/03_API.md`: Error Code `EVENT_NOT_ACTIVE`, Guardrail Semantik für Event Status + Device Patch
- `docs/LeadRadar2026A/04_ADMIN_UI.md`: Events Screen + Mobile Ops Guardrail Notes

## Dateien/Änderungen

- `src/app/api/admin/v1/events/[id]/status/route.ts` (Guardrails + auto-archive + auto-unbind)
- `src/app/api/admin/v1/mobile/devices/[id]/route.ts` (409 EVENT_NOT_ACTIVE + refine fix)
- `src/app/(admin)/admin/events/EventsClient.tsx` (Activate/Archive + Hinweistext)
- `docs/LeadRadar2026A/03_API.md` (Contracts + Error Codes)
- `docs/LeadRadar2026A/04_ADMIN_UI.md` (UX Notes)
- `docs/teilprojekt-3.6-event-guardrails.md` (dieser Rapport)

## Akzeptanzkriterien – Check

- ✅ Max. 1 ACTIVE Event pro Tenant (Auto-archive) — API umgesetzt
- ✅ Device activeEventId kann nur ACTIVE Event sein — 409 EVENT_NOT_ACTIVE umgesetzt
- ✅ Beim ARCHIVE/DRAFT eines Events werden Devices unbound — API umgesetzt
- ✅ Admin UI Hinweise (Events) — umgesetzt
- ⏳ /admin/settings/mobile: Active Event Dropdown nur ACTIVE + Hinweis wenn kein ACTIVE — PENDING (MobileOpsClient fehlt)

## Tests/Proof (reproduzierbar)

```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build
npm run dev
UI Proof:

/admin/events: Event A “Activate”

Event B “Activate” -> A wird automatisch ARCHIVED, Devices vom alten ACTIVE werden unbound

/admin/settings/mobile: (PENDING UI) nach Archive sollte Device activeEventId null sein (API)

curl Proof:

bash
Code kopieren
# status set active (auto-archive)
curl -i -H "x-tenant-slug: atlex" -H "content-type: application/json" \
  -d '{"status":"ACTIVE"}' \
  http://localhost:3000/api/admin/v1/events/<EVENT_ID>/status

# archive (auto-unbind devices)
curl -i -H "x-tenant-slug: atlex" -H "content-type: application/json" \
  -d '{"status":"ARCHIVED"}' \
  http://localhost:3000/api/admin/v1/events/<EVENT_ID>/status

# set device active event (must be ACTIVE)
curl -i -H "x-tenant-slug: atlex" -H "content-type: application/json" \
  -d '{"activeEventId":"<ACTIVE_EVENT_ID>"}' \
  http://localhost:3000/api/admin/v1/mobile/devices/<DEVICE_ID>
Negative Proof (409 EVENT_NOT_ACTIVE):

bash
Code kopieren
curl -i -H "x-tenant-slug: atlex" -H "content-type: application/json" \
  -d '{"activeEventId":"<ARCHIVED_EVENT_ID>"}' \
  http://localhost:3000/api/admin/v1/mobile/devices/<DEVICE_ID>
Offene Punkte/Risiken
P0: Mobile Ops UI Anpassung fehlt (Dropdown nur ACTIVE + Hinweistext). Dafür wird MobileOpsClient.tsx benötigt.

Next Step
Du postest src/app/(admin)/admin/settings/mobile/MobileOpsClient.tsx (und falls nötig .../page.tsx)

Ich liefere kompletten File-Rewrite für Active Event Dropdown (nur ACTIVE + “Kein Event” + Hinweistext), dann Status: DONE ✅ inkl. Commit-Block.
