# Teilprojekt 7.6: Statistik (Admin) — Apple-clean KPIs & Reports (ONLINE-only)

Status: ✅ umgesetzt (MVP)  
Datum: 2026-02-20

## Ziel

Eine Statistik-Seite unter **/admin/stats** mit klaren Kennzahlen pro Tenant (tenantId-scoped, leak-safe) und einem **Traffic-over-the-day** View für heute.

## DB / Datenmodell

Für MVP keine Migration nötig.

Verwendete Felder/Modelle (GoLive-relevant):
- Lead: tenantId, capturedAt, formId, eventId, meta?, isDeleted
- Form: id, name, tenantId
- Event: id, name, tenantId, status=ACTIVE

Hinweis:
- REVIEW/NEW wird MVP-pragmatisch aus `lead.meta` abgeleitet (kein Schema-Feld vorhanden).
- OCR Quote ist optional und wird best-effort via `lead.meta` abgeleitet.

## API Contract

### GET /api/admin/v1/stats/overview

Query:
- range: "7d" | "14d" | "30d" | "90d" (default 30d)
- event: "ACTIVE" | "ALL" | "<eventId>" (default ACTIVE)
- tz: string (default Europe/Zurich)

Response (jsonOk):
- range, timezone, activeEvent?
- kpis: leadsTotal, leadsToday, leadsWeek, leadsActiveEvent?, reviewedCount, newCount, ocrCount?, ocrRate?
- series:
  - leadsByDay: Array<{ day: YYYY-MM-DD; count }>
  - leadsByHourToday: Array<{ hour: 0..23; count }>
  - leadsByStatus: Array<{ status: NEW|REVIEWED; count }>
- tops: events[], forms[]

Tenant Scope:
- Jede Query mit where: { tenantId }
Leak-safe:
- eventId explizit, aber nicht im Tenant → 404 NOT_FOUND

## UI Aufbau (/admin/stats) — Apple-clean “flashy”

- Typografischer Hero: Leads (Zeitraum) + Sparkline Trend
- KPI Strip: Heute, Woche, Review Rate, OCR
- Traffic: 24h Heat (Bars) für heute (TZ)
- Insights: Peak Hour, Offene Leads, Scope
- Top Formulare / Top Events als minimalistische Listen (hover only)

## Tests / Proof (reproduzierbar)

### API (curl)

curl -i "http://localhost:3000/api/admin/v1/stats/overview?range=30d&event=ACTIVE"
curl -i "http://localhost:3000/api/admin/v1/stats/overview?range=30d&event=ALL"

Erwartung:
- HTTP 200
- Body ok:true
- Header x-trace-id gesetzt
- series.leadsByHourToday vorhanden (24 Einträge)

Leak-safe Check:
curl -i "http://localhost:3000/api/admin/v1/stats/overview?range=30d&event=<FOREIGN_EVENT_ID>"
→ 404 NOT_FOUND (keine Leaks)

### UI

- Admin öffnen → /admin/stats
- Range wechseln (7d/14d/30d/90d) → Trend/KPIs aktualisieren
- Scope ACTIVE/ALL → KPIs/Top-Listen aktualisieren
- Traffic zeigt Stundenverteilung für heute

### Quality Gates

- npm run typecheck
- npm run lint
- npm run build

## Offene Punkte / Risiken

P1: TZ-Bucketing ist pragmatisch via Intl (MVP).
P1: REVIEW/OCR Ableitung via meta ist best-effort bis ein fixes Feld/Modell final ist.

## Next Step

- Optional: Status/OCR als echte DB-Felder bzw. Join-Quelle standardisieren
- Optional: “Traffic last 7 days (hourly avg)” für noch mehr Nutzen
