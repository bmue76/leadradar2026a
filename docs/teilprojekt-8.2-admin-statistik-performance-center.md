# Teilprojekt 8.2 — /admin/statistik: Premium Messe Performance Center (Live Polling) + de-CH Microcopy

Stand: 2026-02-26  
Status: DONE ✅ (Phase 1 / ONLINE-only)

---

## Titel + Status + Datum + Commit(s)

**Titel:** TP 8.2 — /admin/statistik: Premium Messe Performance Center  
**Status:** DONE ✅  
**Datum:** 2026-02-26 (Europe/Zurich)  
**Commit(s):**
- a2b2962 — fix(tp8.2): route admin statistik + sidebar link + legacy stats redirect
- 5039f6d — feat(tp8.2): admin statistik performance center + polling stats api

---

## Ziel

Entwicklung eines Premium Screens unter **/admin/statistik** als **Messe Performance Center** für Messeleiter:

- Performance messbar machen
- Peak-Zeiten sichtbar machen
- Geräte-/Team-Performance vergleichbar machen
- Lead-Qualität transparent machen
- Live mitlaufen können (MVP Polling)

Nicht enthalten:
- KPI-Karten-Orgie
- Setup-Logik / Systemstatus-Rehash
- AI Messebericht (explizit nicht Teil von TP 8.2)

Hinweis (Naming): In der Sidebar wird der Bereich inzwischen als **Performance** geführt (UI-Labeling; Route bleibt `/admin/statistik`).

---

## Umsetzung (Highlights)

- **Neuer Screen `/admin/statistik`** mit Executive Header (Event, Range Selector, dominanter KPI), ruhiger Struktur und de-CH Microcopy.
- **Live Auto-Refresh Mode (MVP Polling)**:
  - 30s Intervall
  - nur 1 in-flight Request
  - Tab hidden ⇒ Auto-Pause
  - Fehler ⇒ Statusanzeige + Retry (Backoff vorbereitet via Poll-Intervall-Logik)
  - Statuszeile: „Aktualisiere …“ / „Aktualisiert vor …s“ / „Live-Update fehlgeschlagen“ + TraceId
- **Serverseitige Aggregation** (kein heavy Client-Aggregation):
  - Headline: leadsTotal, deltaPct (vs previous window), qualifiedPct, devicesActiveCount, peakHourLabel
  - Traffic: Leads pro Stunde (optional Vergleich)
  - Geräte-Ranking (inkl. Leads/Std. als sekundäre Zahl)
  - Top Interessen (generisches Extract aus SINGLE/MULTI_SELECT Feldern)
  - Top Formulare
  - Lead-Qualität: % Visitenkarte, % Notizen, % qualifiziert + ruhiger Funnel
- **Tenant-scope non-negotiable**: Admin API tenant-scoped, leak-safe 404 bei falschem Tenant/Event.
- **Routing Cleanup**:
  - Legacy `/admin/stats` redirectet sauber auf `/admin/statistik`.
  - Sidebar-Link auf `/admin/statistik` umgestellt.

---

## Dateien/Änderungen

### DB
- `prisma/schema.prisma`
  - Lead KPI Felder ergänzt:
    - `capturedByDeviceId String?`
    - `hasNotes Boolean @default(false)`
    - `isQualified Boolean @default(false)`
  - Indizes ergänzt:
    - `@@index([tenantId, eventId, capturedByDeviceId, capturedAt])`
    - `@@index([tenantId, eventId, isQualified, capturedAt])`
- `prisma/migrations/20260225212845_tp8_2_admin_statistik_kpis/`

### API
- `src/app/api/admin/v1/statistics/_repo.ts`
- `src/app/api/admin/v1/statistics/route.ts`
- `src/app/api/admin/v1/statistics/events/route.ts`

### UI
- `src/app/(admin)/admin/statistik/page.tsx`
- `src/app/(admin)/admin/statistik/StatistikClient.tsx`
- `src/app/(admin)/admin/statistik/_components/Segmented.tsx`
- `src/app/(admin)/admin/statistik/_components/LineChart.tsx`

### Routing / Navigation
- `src/app/(admin)/admin/stats/page.tsx` (Redirect → `/admin/statistik`)
- `src/app/(admin)/admin/_components/SidebarNav.tsx` (Link umgestellt)

### Docs
- `docs/LeadRadar2026A/03_API.md` (Statistik Endpoints ergänzt)
- `docs/LeadRadar2026A/04_ADMIN_UI.md` (Screen Spec `/admin/statistik` ergänzt)

### Proof Script
- `scripts/proof-tp8.2-statistics.sh`

---

## Akzeptanzkriterien – Check

- ✅ Apple-clean, ruhig, Premium SaaS Layout (keine KPI-Orgie)
- ✅ 1 Primary Action pro Screen (MVP: „Leads öffnen“)
- ✅ Live Mode via Polling (30s), robust (1 inflight, tab hidden pause)
- ✅ Statuszeile + Retry + TraceId (de-CH Microcopy)
- ✅ Tenant-scoped, leak-safe 404 geprüft via Policy (event tenant-bound)
- ✅ Archivierte Events: read-only, Live disabled
- ✅ Docs (03_API.md, 04_ADMIN_UI.md) committed
- ✅ Legacy `/admin/stats` → `/admin/statistik` Redirect
- ✅ Commits gepusht: a2b2962 + 5039f6d

---

## Tests/Proof (reproduzierbar)

### Quality Gates
```bash
npm run typecheck
npm run lint
npm run build
API Proof (Polling-ready + traceId)
TENANT_SLUG=atlex EVENT_ID="evt_XXXX" ./scripts/proof-tp8.2-statistics.sh

Erwartung:

Response enthält data.generatedAt

Header enthält x-trace-id

2 Calls ⇒ generatedAt verändert sich

UI Proof (manuell sichtbar)

/admin/statistik öffnen

Event auswählen

Toggle Live:

Status: „Aktualisiere …“ → „Aktualisiert vor 0s“

In anderem Tab/Mobile neue Leads erfassen

Nach nächstem Poll: Headline/Chart aktualisiert

Offene Punkte/Risiken (P0/P1/…)

P1: “Top Interessen” generisch aus Select/MultiSelect Feldern extrahiert — für stark custom Forms ggf. später feinjustieren (Exclusions, Label-Mapping).

P1: Quality-Flags sind DB-Felder, aktuell zusätzlich mit Fallback über meta/values. Langfristig Write-time konsequent setzen (Phase 2/Refactor).

Next Step

TP 8.3 (Light) umgesetzt: Reports → Executive Messebericht (Beta) als Premium-Teaser (ohne AI/PDF/Backend).

Optional TP (Polish): Range-Compare Regeln (“heute/gestern/event/custom”), bessere Event-Auswahl UX, optional Vergleich-Switch + “Last updated” UX.

Optional: serverseitige Normalisierung für “Top Interessen” (LeadInterest Tabelle), falls Performance/Genauigkeit später kritisch wird.
