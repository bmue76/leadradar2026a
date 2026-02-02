# Schlussrapport — Teilprojekt 5.9: Betrieb — Integration-Polish (Leads → Exports Prefill) + Busy/State Cleanup (ONLINE-only)

Datum: 2026-02-02  
Status: DONE ✅  
Git: `3b735eb` — ui(tp5.9): leads export CTA + exports prefill + busy/polling polish  
Git: `db59923` — (docs/index/cleanup, siehe Repo-Log)

## Ziel

Operativer Flow mit “1 Klick weniger” und stabiler/ruhiger UX:

- CTA **„Exportieren“** auf **/admin/leads** übernimmt aktuelle Filter (Status, Suche) und navigiert nach **/admin/exports** mit Prefill Query Params.
- **/admin/exports** übernimmt Prefill beim initialen Laden, User kann Werte danach ändern.
- Busy/States: klare Disabled/Loading States, Polling nur bei QUEUED/RUNNING, TraceId bei Errors bleibt.

## Umsetzung (Highlights)

### A) Leads → Exports Prefill
- CTA **„Exportieren“** in der Leads-Toolbar.
- Mapping Leads UI State → Query Params:
  - Status Pills: ALL/NEW/REVIEWED → `leadStatus`
  - Suche `q` → `q` (nur wenn gesetzt)
  - Scope GoLive: `scope=ACTIVE_EVENT` (Phase 1 ONLINE-only)
- Navigation: `/admin/exports?scope=ACTIVE_EVENT&leadStatus=...&q=...`

### B) Exports Prefill aus Query Params
- Server Page liest `searchParams` (Suspense-safe) und übergibt `initialDefaults` an Client.
- Client setzt initiale State Defaults (controlled) und erlaubt danach Anpassung durch User.
- „CSV exportieren“ nutzt die sichtbaren Werte (keine Diskrepanz).

### C) Busy/State Cleanup (GoLive-relevant)
- „CSV exportieren“: disabled + busy text während POST läuft.
- Fehler: Inline-Error mit TraceId (Copy bleibt).
- Polling:
  - Aktiv nur, wenn Jobs `QUEUED` oder `RUNNING` existieren.
  - Stop bei `DONE/FAILED` bzw. unmount.
  - Ruhiges Intervall (ca. 2.5s), keine Doppel-Intervals.

## Dateien/Änderungen

- `src/app/(admin)/admin/leads/LeadsClient.tsx`
- `src/app/(admin)/admin/exports/ExportsScreenClient.tsx`
- `src/app/(admin)/admin/exports/page.tsx`
- `docs/LeadRadar2026A/00_INDEX.md`
- `docs/teilprojekt-5.9-betrieb-integration-polish-leads-to-exports.md`

## Akzeptanzkriterien — Check ✅

- ✅ Leads: CTA „Exportieren“ übergibt Filter korrekt (scope/status/q)
- ✅ Exports: Prefill übernimmt Params und zeigt sie in UI korrekt
- ✅ Exports: „CSV exportieren“ nutzt sichtbare Werte
- ✅ Busy states: keine Doppel-Clicks, klare UX, de-CH Copy
- ✅ Polling nur bei QUEUED/RUNNING, stoppt sauber
- ✅ DoD grün: typecheck/lint/build
- ✅ Doku + Schlussrapport + git clean + push

## Tests/Proof (reproduzierbar)

```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build
UI Smoke:

/admin/leads → Filter setzen (z.B. „Neu“ + Suche) → Exportieren

/admin/exports öffnet mit Prefill → Werte stimmen

CSV exportieren → Job erscheint → Polling aktualisiert Status

DONE → Download funktioniert

FAILED → Retry möglich + TraceId sichtbar

Offene Punkte / Risiken
P1: Prefill ist „initial load“-basiert (State bleibt nachträglich kontrolliert durch User; Query-Änderungen ohne Remount sind nicht MVP-relevant).

P1: Download ist Link-basiert; Browser-Blocking/Popup ist je nach Umgebung möglich (MVP ok).

Next Step
GoLive-Checkliste aktualisieren (Release Tests / Smoke) und nächste Betrieb-Härtung gemäss Roadmap (TP 6.x).
