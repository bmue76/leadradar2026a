# Teilprojekt 9.1: Mobile Foundations (Android zuerst) — Settings + API Client + Tenant Header + Healthcheck

**Status:** DONE (nach Merge der Commits unten)  
**Datum:** 2026-02-27 (Europe/Zurich)  
**Commit(s):** TODO (nach Commit ergänzen)

---

## Ziel
Technisches Mobile-Fundament (ONLINE-only) für GoLive-ready:
- Settings Screen: `baseUrl`, `tenantSlug`, `deviceUid` (copybar), Persistenz
- Zentraler `apiFetch()` Wrapper: Tenant Header, Timeout, jsonOk/jsonError, traceId Propagation
- Healthcheck UI: „Verbindung testen“ mit klaren States und sichtbarer Trace-ID im Fehlerfall
- Phase-2 Vorbereitung: Outbox/Sync als Types/Ordnerstruktur (ohne Implementierung)

---

## Umsetzung (Highlights)
- **Settings Store** (`appSettings.ts`) als zentrale Source of Truth für:
  - persisted `baseUrl` + `tenantSlug` (SecureStore)
  - stable `deviceUid` (einmalige UUID, persisted)
  - DEV-only Fallback auf `.env` Base URL (klar gekennzeichnet)
- **apiFetch** erweitert:
  - injiziert automatisch `x-tenant-slug` (für `/api/*` Calls)
  - Timeout (AbortController)
  - robustes Parsing (Text → JSON safe)
  - konsistente Errors für UI inkl. `traceId` (Body + `x-trace-id`)
- **Settings UI** neu:
  - Base URL + Tenant editierbar & speicherbar
  - Device UID read-only + Copy-to-Clipboard
  - Healthcheck Button gegen `/api/platform/v1/health`

---

## Dateien/Änderungen
Mobile:
- `apps/mobile/app/settings.tsx` (UI + Healthcheck + Persistenz)
- `apps/mobile/src/lib/appSettings.ts` (Settings Store neu)
- `apps/mobile/src/lib/api.ts` (apiFetch: tenant header + timeout + traceId)
- `apps/mobile/src/lib/mobileApi.ts` (BaseUrl an Settings gebunden)
- `apps/mobile/src/offline/*` (Phase-2 Types Skeleton)

Docs:
- `docs/teilprojekt-9.1-mobile-foundations.md`
- `docs/LeadRadar2026A/00_INDEX.md`
- `docs/LeadRadar2026A/05_RELEASE_TESTS.md`

---

## Akzeptanzkriterien – Check
- [ ] Android Emulator + reales Android Device:
  - [ ] Settings speichern → Neustart → Werte bleiben
  - [ ] deviceUid bleibt stabil und ist copybar
- [ ] Jeder API Call setzt `x-tenant-slug` (sichtbar in Debug/Logs; enforced für `/api/*`)
- [ ] Healthcheck:
  - [ ] success bei korrekter baseUrl/tenantSlug
  - [ ] error bei falscher baseUrl, inkl. message + traceId + Retry
- [ ] Code Quality:
  - [ ] `npm run typecheck` → 0 Errors
  - [ ] `npm run lint` → 0 Errors (Warnings ok)
  - [ ] `npm run build` → grün (falls relevant)
- [ ] Docs aktualisiert + Schlussrapport committed

---

## Tests/Proof (reproduzierbar)
```bash
cd apps/mobile
npx expo start -c

Flow:

Einstellungen öffnen

Base URL + Tenant setzen → Speichern

„Verbindung testen“:

Success → „Verbunden“ + Trace-ID

Fehlerfall:

Base URL absichtlich falsch → „Verbindung testen“

Error → Message + Trace-ID sichtbar + Retry

App killen + neu starten:

Base URL / Tenant / deviceUid sind weiterhin da

Offene Punkte/Risiken (P0/P1/…)

P1: Langfristig mobileApi.ts komplett in apiFetch() konsolidieren (aktueller Stand: kompatibel, aber parallel).

P1: Optional: Settings in UI mit „Ungültig“-Inline Validation (heute: Save-Guard + Hinweis).

Next Step

TP 9.2: Activation/Lizenz Gate (auf Basis von Settings + apiFetch)
