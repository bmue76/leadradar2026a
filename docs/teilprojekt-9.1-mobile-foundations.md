# Teilprojekt 9.1: Mobile Foundations (Android zuerst) — Settings + API Client + Tenant Header + Healthcheck

**Status:** DONE  
**Datum:** 2026-02-27 (Europe/Zurich)  
**Commit(s):**
- 07c40ca — chore(tp9.1): add expo-clipboard dependency
- 45de23e — fix(tp9.1): make settings screen scrollable
- 92f1c29 — feat(tp9.1): mobile settings + api client + healthcheck foundation

---

## Ziel
Technisches Mobile-Fundament (ONLINE-only) für GoLive-ready:
- Settings Screen: `baseUrl`, `tenantSlug`, `deviceUid` (copybar), Persistenz
- Zentraler `apiFetch()` Wrapper: Tenant Header, Timeout, jsonOk/jsonError, traceId Propagation
- Healthcheck UI: „Verbindung testen“ mit klaren States und sichtbarer Trace-ID im Fehlerfall
- Phase-2 Vorbereitung: Outbox/Sync als Types/Ordnerstruktur (ohne Implementierung)

---

## Umsetzung (Highlights)
- **Settings Store** (`appSettings.ts`) als zentrale Source of Truth:
  - persisted `baseUrl` + `tenantSlug` (SecureStore)
  - stable `deviceUid` (einmalige UUID, persisted)
  - DEV-only Fallback auf `.env` Base URL (klar gekennzeichnet)
- **apiFetch** erweitert:
  - injiziert automatisch `x-tenant-slug` für `/api/*`
  - Timeout (AbortController)
  - robustes Parsing (Text → JSON safe)
  - konsistente Errors für UI inkl. `traceId` (Body + `x-trace-id`)
- **Settings UI**:
  - Base URL + Tenant editierbar & speicherbar
  - Device UID read-only + Copy-to-Clipboard
  - Healthcheck Button gegen `/api/platform/v1/health`

---

## Dateien/Änderungen
Mobile:
- `apps/mobile/app/settings.tsx`
- `apps/mobile/src/lib/appSettings.ts`
- `apps/mobile/src/lib/api.ts`
- `apps/mobile/src/lib/mobileApi.ts`
- `apps/mobile/src/offline/outboxTypes.ts`
- `apps/mobile/src/offline/index.ts`

Docs:
- `docs/teilprojekt-9.1-mobile-foundations.md`
- `docs/LeadRadar2026A/05_RELEASE_TESTS.md` (Manual Smoke ergänzt)
- `docs/LeadRadar2026A/00_INDEX.md` (Link ergänzt)
- `docs/LeadRadar2026A/tp9.1-schlussrapport-mobile-foundations.md`

---

## Akzeptanzkriterien – Check
- [x] Android Emulator + reales Android Device:
  - [x] Settings speichern → Neustart → Werte bleiben
  - [x] deviceUid bleibt stabil und ist copybar
- [x] Jeder `/api/*` Call setzt `x-tenant-slug` (enforced)
- [x] Healthcheck:
  - [x] success bei korrekter baseUrl/tenantSlug
  - [x] error bei falscher baseUrl, inkl. message + Retry (traceId bei Netzwerkfehlern ggf. nicht verfügbar)
- [x] Code Quality:
  - [x] `npm run typecheck` → 0 Errors
  - [x] `npm run lint` → 0 Errors (Warnings ok)
  - [x] `npm run build` → grün (falls relevant)
- [x] Docs aktualisiert + Schlussrapport committed

---

## Tests/Proof (reproduzierbar)
```bash
cd apps/mobile
npx expo start --dev-client -c
```

**Flow (real device):**
1) Einstellungen → Base URL + Tenant setzen → **Speichern**
2) Device UID → **Kopieren** → Paste extern (Beweis)
3) „Verbindung testen“ → **Verbunden**
4) Base URL absichtlich falsch → „Verbindung testen“ → Error + Retry
5) App kill/restart → Werte + deviceUid bleiben gleich

---

## Offene Punkte/Risiken (P0/P1/…)
- P1: `mobileApi.ts` perspektivisch vollständig auf `apiFetch()` konsolidieren (Single Source of Truth).

---

## Next Step
- TP 9.2: Activation/Lizenz Gate (auf Basis von Settings + apiFetch, leak-safe / tenant-scoped)
