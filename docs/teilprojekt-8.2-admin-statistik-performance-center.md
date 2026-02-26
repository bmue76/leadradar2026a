# Teilprojekt 8.2 — /admin/statistik: Premium Messe Performance Center (Live Polling) + de-CH Microcopy

Stand: 2026-02-25  
Status: IN ARBEIT  
Scope: Phase 1 (ONLINE-only) — kein Offline, kein AI Messebericht

## Ziel

Premium Statistik-Screen unter **/admin/statistik** als **Messe Performance Center** für Messeleiter:

- Performance messbar machen
- Peak-Zeiten sichtbar machen
- Geräte-/Team-Performance vergleichbar machen
- Lead-Qualität transparent machen
- Live mitlaufen (MVP Polling)

Nicht enthalten:
- KPI-Karten-Orgie
- Systemstatus/Setup-Logik
- AI Messebericht (Phase 2)

## UX/Design Leitplanken

- Apple-clean, ruhig, Premium SaaS
- Struktur: SumUp / Klarheit: Square / Reduktion: Linear
- 1 Primary Action pro Screen
- Farbe nur funktional (Live/Pause/Error)
- Keine Status-Chip-Orgie
- Tenant-scope non-negotiable, leak-safe 404

## KPI-Datenpunkte (final)

### Executive Header
- Event: name, status
- Range: TODAY | YESTERDAY | EVENT_TOTAL | CUSTOM (+ from/to)
- Dominant: leadsTotal
- Secondary: deltaPct (+ compareLabel), qualifiedPct, devicesActiveCount, peakHourLabel
- Live Control: Toggle Live/Pausiert
- Statuszeile: “Aktualisiert vor …” / “Aktualisiere …” / “Live-Update fehlgeschlagen” + Retry + TraceId

### Traffic
- Leads pro Stunde (ruhiger Linienchart)
- optional Vergleich “gestern” (nur wenn sinnvoll)

### Geräte-Performance
- Ranking: deviceLabel + leadsTotal (optional leadsPerHourAvg klein)

### Interessen/Formularanalyse
- TopInterests: label + count (Top 8–12)
- optional TopForms (Top 5)

### Lead-Qualität
- cardPct, notesPct, qualifiedPct
- optional Funnel: Erfasst → Mit Visitenkarte → Qualifiziert

## States

A) Kein aktives Event
- Hinweis + CTA “Event auswählen”

B) Event aktiv, keine Leads
- ruhiger Null-State

C) Event läuft
- volles Performance Center

D) Event archiviert
- read-only, kein Live

## Live Auto-Refresh (MVP Polling)

- Intervall: 30s
- Nur 1 in-flight Request (Mutex)
- Langsame Response → nächster Poll wird übersprungen
- Tab hidden → Auto-Pause
- Error → Backoff (30s → 60s → 120s max) + Statusanzeige
- Response enthält generatedAt + traceId
- No heavy Client-Aggregation

## API Contract (MVP: 1 Endpoint)

GET /api/admin/v1/statistics

Query:
- eventId (required)
- range = today|yesterday|event|custom
- from/to (required if custom)
- compare = none|previous (default previous)

Response (jsonOk):
- generatedAt
- event {id,name,status}
- range {key,from,to,compareLabel}
- headline {leadsTotal, deltaPct?, qualifiedPct, devicesActiveCount, peakHourLabel, liveAllowed}
- traffic.byHour[{hourStart,leads,leadsCompare?}]
- devices.ranking[{deviceId,label,leadsTotal,leadsPerHourAvg?}]
- insights.topInterests[{label,count}]
- insights.topForms[{formId,name,count}] (optional)
- quality {cardPct,notesPct,qualifiedPct,funnel?}
- traceId (body) + x-trace-id (header)

Errors:
- 404 NOT_FOUND leak-safe bei falschem tenant/event
- Standard jsonError

## DB/Index Plan (MVP)

Ziel: schnelle Aggregation nach tenantId+eventId+capturedAt.

Leads:
- flags: hasBusinessCard, hasNotes, isQualified (Write-time gepflegt)
- Indizes:
  - (tenantId,eventId,capturedAt)
  - (tenantId,eventId,capturedByDeviceId,capturedAt)
  - (tenantId,eventId,formId,capturedAt)

Interests (empfohlen):
- neue Tabelle LeadInterest (tenantId,eventId,leadId,label,createdAt)
- Indizes:
  - (tenantId,eventId,createdAt)
  - (tenantId,eventId,label)

## Umsetzungsschritte (Prozess)

1) DB: Prisma Schema + Migration + Indizes
2) Aggregation: Repo/Queries (serverseitig)
3) API: Route + Zod validateQuery + jsonOk/jsonError + traceId
4) UI: /admin/statistik Screen + Live Control + States + de-CH Microcopy
5) Tests/Proof: Polling nachvollziehbar, Leak-safe 404, manuelle UI-Checks
6) Docs: 03_API.md + 04_ADMIN_UI.md + Schlussrapport
7) Commit/Push

## Proof (reproduzierbar)

- curl: generatedAt & x-trace-id vorhanden, 2 Calls → generatedAt neu
- UI: Live Toggle → “Aktualisiere …” → “Aktualisiert vor 0s”
- Datenänderung → nächste Poll-Runde aktualisiert KPI/Chart
- Leak-safe: fremde eventId → 404

## DoD

- npm run typecheck → 0
- npm run lint → 0
- npm run build → grün (wenn relevant)
- Polling robust (1 inflight, backoff, tab hidden pause)
- States getestet (A–D)
- Docs committed
- git status clean
