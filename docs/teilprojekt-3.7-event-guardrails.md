# Schlussrapport — Teilprojekt 3.7: Event Guardrails (ACTIVE Invariants + Device Auto-Unbind + Ops Safety) — ONLINE-only (MVP)

Status: ✅ DONE  
Datum: 2026-01-13  
Commit(s): 542f79f

---

## Ziel

Events/Devices so absichern, dass im Messebetrieb keine inkonsistenten ACTIVE-Zustände entstehen und Event-Wechsel operativ sicher sind:

- Pro Tenant maximal 1 ACTIVE Event (Auto-Archive)
- Beim ARCHIVE (oder Auto-Archive) werden Devices automatisch gelöst (activeEventId=null)
- Device Binding nur auf ACTIVE Events (sonst 409 EVENT_NOT_ACTIVE)
- Admin UI führt sicher (Dropdown nur ACTIVE + “Kein Event”, Hinweis bei none)
- Leak-safe / tenantId-scoped überall

---

## Umsetzung (Highlights)

1) **ACTIVE Invariant (MVP Policy)**
- Beim Setzen eines Events auf ACTIVE werden **alle anderen ACTIVE Events** im gleichen Tenant automatisch auf ARCHIVED gesetzt (defensiv: clean up inkonsistente Zustände).

2) **Ops Safety: Auto-Unbind bei Statuswechsel**
- Beim Wechsel von ACTIVE → ARCHIVED (oder generell non-ACTIVE) werden alle Devices mit `activeEventId=<eventId>` auf `null` gesetzt.
- Leads bleiben historisch korrekt (`lead.eventId` bleibt bestehen, keine Nachbearbeitung).

3) **Explizite Admin Action (Ops)**
- `POST /api/admin/v1/events/:id/unbind-devices` löst Devices on-demand und gibt `unboundDevicesCount` zurück.

4) **Admin UI**
- `/admin/events`: klare Guardrail-Erklärung + Actions + “Devices lösen” (Danger Zone light).
- `/admin/settings/mobile`: Active Event Dropdown zeigt nur ACTIVE Events + “Kein Event”; Hinweis wenn kein ACTIVE Event existiert.

5) **Stabilität/DoD**
- Typecheck/Lint/Build wieder grün (Fix für `/events/active` + Lint-Directive).

---

## Dateien/Änderungen

- `src/lib/eventsGuardrails.ts` (Guardrail Service, tenant-scoped, TX, auto-archive + auto-unbind)
- `src/app/api/admin/v1/events/[id]/status/route.ts` (nutzt Guardrail Service, Response Meta)
- `src/app/api/admin/v1/events/[id]/unbind-devices/route.ts` (Ops Endpoint)
- `src/app/api/admin/v1/events/active/route.ts` (Typecheck Fix, NextRequest + tenantContext)
- `src/app/(admin)/admin/events/EventsClient.tsx` (Hinweis + Danger Zone “Devices lösen”)
- `src/app/(admin)/admin/settings/mobile/MobileOpsClient.tsx` (Dropdown “Kein Event” + Hinweis bei none)
- `src/lib/route.ts` (Lint Warning entfernt)

---

## Akzeptanzkriterien – Check

✅ Max 1 ACTIVE Event pro Tenant (Auto-Archive)  
✅ ARCHIVE eines Events unbindet Devices (activeEventId=null) + Count nachvollziehbar  
✅ Device activeEventId kann nur ACTIVE Event sein (sonst 409 EVENT_NOT_ACTIVE; wrong tenant => 404 leak-safe)  
✅ Admin UI führt sicher (Dropdown nur ACTIVE + “Kein Event”, Hinweis bei none)  
✅ Tenant-scope + leak-safe 404 überall  
✅ typecheck/lint/build grün  
✅ Docs/Schlussrapport committed + push  
✅ git status clean

---

## Tests/Proof (reproduzierbar)

```bash
cd /d/dev/leadradar2026a

npm run auth:smoke
npm run typecheck
npm run lint
npm run build
npm run dev
Curl Proof (Atlex):

bash
Code kopieren
# Event ACTIVE (auto-archive other)
curl -i -X PATCH -H "x-tenant-slug: atlex" -H "content-type: application/json" \
  -d '{"status":"ACTIVE"}' \
  "http://localhost:3000/api/admin/v1/events/<EVENT_ID>/status"

# Event ARCHIVED (auto-unbind devices)
curl -i -X PATCH -H "x-tenant-slug: atlex" -H "content-type: application/json" \
  -d '{"status":"ARCHIVED"}' \
  "http://localhost:3000/api/admin/v1/events/<EVENT_ID>/status"

# Explicit unbind
curl -i -X POST -H "x-tenant-slug: atlex" \
  "http://localhost:3000/api/admin/v1/events/<EVENT_ID>/unbind-devices"
UI Proof:

/admin/events: Activate Event B → Event A wird automatisch ARCHIVED; optional “Devices lösen”.

/admin/settings/mobile: Dropdown zeigt nur ACTIVE Events + “Kein Event”; Hinweis bei none.

Offene Punkte / Risiken
P0: keine
P1: ripgrep (rg) fehlt lokal – optional installieren (nur Dev UX)

Next Step
Nächster Teilprojektblock: (falls geplant) weitere Ops/Analytics (KPIs) oder Offline-Prep (Phase 2) — Outbox/Sync Architektur.
