# LeadRadar2026A — Projekt-Hinweise (verbindlich)

Stand: 2025-12-31  
Prinzip: GoLive-ready Rebuild — screen-by-screen, testgetrieben, dokumentiert.

## Leitplanken
1) Prozess: **DB → API → UI(Screen) → Tests/Proof → Schlussrapport → Commit/Push**
2) Tenant-Scope non-negotiable: **tenantId-scoped**, mismatch ⇒ **404 NOT_FOUND**
3) API Standard: `jsonOk/jsonError` + `traceId` im Body & `x-trace-id` Header
4) Validation: ausschließlich Zod via `src/lib/http.ts` (`validateBody/validateQuery`)
5) Code-Regel: keine Snippets; vollständige Dateien; Git-Bash copy/paste (`cat <<'EOF'`)
6) DoD: typecheck 0 errors, lint 0 errors (warnings ok), build grün, Proof, Docs, clean git, Push+Hash
7) UX/Polish ist Teil jedes Teilprojekts (Loading/Empty/Error, klare Texte, keine Debug-UI)

## Phase-Entscheid
- Phase 1: ONLINE-only
- Offline/Outbox/OCR/Dashboards später als Epics, aber Architektur kompatibel halten
