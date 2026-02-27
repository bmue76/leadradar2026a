# Schlussrapport — Teilprojekt 9.1: Mobile Foundations (Android zuerst)

**Status:** DONE  
**Datum:** 2026-02-27 (Europe/Zurich)  
**Commit(s):**
- 07c40ca — chore(tp9.1): add expo-clipboard dependency
- 45de23e — fix(tp9.1): make settings screen scrollable
- 92f1c29 — feat(tp9.1): mobile settings + api client + healthcheck foundation

---

## Ziel
Ein belastbares Mobile-Fundament (ONLINE-only) schaffen:
- Settings (Base URL, Tenant, Device UID) persistent
- Zentraler API-Client mit Tenant-Header + Timeout + traceId
- Healthcheck UI mit klaren Zuständen & traceId sichtbar
- Phase-2 Vorarbeit: Outbox/Sync Skeleton (nur Types/Struktur)

---

## Umsetzung (Highlights)
- `appSettings.ts` als zentrale persisted Settings-Quelle (SecureStore), inkl. stable `deviceUid`.
- `apiFetch()` vereinheitlicht:
  - injiziert `x-tenant-slug` für `/api/*`
  - Timeout + robustes Parsing
  - Error-Objekte UI-tauglich inkl. `traceId` (Body/Header)
- Settings-Screen als Apple-clean Setup Hub:
  - Base URL + Tenant editierbar
  - Device UID copybar
  - „Verbindung testen“ gegen `/api/platform/v1/health` (ohne Mobile Auth)

---

## Dateien/Änderungen
- `apps/mobile/app/settings.tsx`
- `apps/mobile/src/lib/appSettings.ts`
- `apps/mobile/src/lib/api.ts`
- `apps/mobile/src/lib/mobileApi.ts`
- `apps/mobile/src/offline/outboxTypes.ts`
- `apps/mobile/src/offline/index.ts`
- `docs/teilprojekt-9.1-mobile-foundations.md`
- `docs/LeadRadar2026A/tp9.1-schlussrapport-mobile-foundations.md`

---

## Akzeptanzkriterien — Check
- [x] Settings speichern → App Neustart → Werte bleiben erhalten
- [x] `deviceUid` stabil + copybar
- [x] Jeder `/api/*` Call sendet `x-tenant-slug` (enforced)
- [x] Healthcheck success/error inkl. Retry (traceId bei Netzwerkfehlern ggf. nicht verfügbar)
- [x] `npm run typecheck` grün
- [x] `npm run lint` grün (Warnings ok)

---

## Tests/Proof (reproduzierbar)
```bash
cd apps/mobile
npx expo start --dev-client -c
```

Manual Smoke:
1) Einstellungen → Base URL + Tenant setzen → Speichern
2) Verbindung testen → „Verbunden“
3) Base URL falsch → Verbindung testen → Error + Retry
4) App kill/restart → Werte & deviceUid unverändert

---

## Offene Punkte/Risiken (P0/P1/…)
- P1: `mobileApi.ts` perspektivisch vollständig auf `apiFetch()` konsolidieren.

---

## Next Step
TP 9.2 — Activation/Lizenz Gate (auf Basis von Settings + apiFetch, weiterhin leak-safe / tenant-scoped).
