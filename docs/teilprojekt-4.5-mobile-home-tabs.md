# Teilprojekt 4.5 — Mobile Home Screen (Tabs: Home/Forms/Leads/Stats/Settings) + Home APIs — ONLINE-only (MVP)

Datum: 2026-01-23  
Status: IN_PROGRESS ✅ (Code vorbereitet, Pending: lokale Tests + Commit Hashes)

## Ziel
Produktionsreifer Mobile Home Screen (Expo/RN) für Messepersonal:
- Aktives Event sichtbar
- Schnellstart Lead-Erfassung (Primary CTA)
- Quick Actions: Visitenkarte / Manuell
- Mini-Statistik “Heute” (Tap → Stats)
- Stabiler UX-State (Loading/Empty/Error/No Forms/No Event)
- ONLINE-only; offline-ready via SWR-light Cache (keine Outbox)

## Umsetzung (Highlights)
- Backend: neue Mobile READ Endpoints:
  - `GET /api/mobile/v1/events/active`
  - `GET /api/mobile/v1/stats/me?range=today&tzOffsetMinutes=...`
- Mobile:
  - Root Tabs via `app/_layout.tsx` (kein Verschieben von `forms/*` nötig → Import-Pfade bleiben stabil)
  - Home Screen READ-only (events/forms/stats), Pull-to-refresh, Form-Picker BottomSheet
  - Stats Tab nutzt `stats/me`
  - Leads Tab: lokale “Recent Captures” (READ-only placeholder, bis Capture-Flow recents speichert)

## API Contracts (Details)

### GET /api/mobile/v1/events/active
Response:
- `jsonOk({ activeEvent: { id, name, startsAt?, endsAt?, location? } | null })`
Errors:
- 401 UNAUTHENTICATED (missing/invalid api key)
- 404 NOT_FOUND leak-safe
- 500 INTERNAL

### GET /api/mobile/v1/stats/me?range=today&tzOffsetMinutes=-60
Response minimal:
- `leadsToday: number`
- `avgPerHour: number`
- `pendingAttachments: number`
Optional:
- `todayHourlyBuckets: [{ hour:number, count:number }]`
- `lastLeadAt: string | null`
Errors:
- 400 INVALID_QUERY
- 401 UNAUTHENTICATED
- 404 NOT_FOUND leak-safe
- 500 INTERNAL

## Dateien/Änderungen
Backend:
- `src/app/api/mobile/v1/events/active/route.ts`
- `src/app/api/mobile/v1/stats/me/route.ts`

Mobile:
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/app/index.tsx`
- `apps/mobile/app/leads.tsx`
- `apps/mobile/app/stats.tsx`
- `apps/mobile/src/features/home/useHomeData.ts`
- `apps/mobile/src/lib/swrCache.ts`
- `apps/mobile/src/ui/BottomSheetModal.tsx`

## Akzeptanzkriterien – Check (Plan)
- [ ] Home: Active Event sichtbar (oder Warncard + Retry)
- [ ] CTA: 1 Form → direkt Capture; >1 → Form Sheet; 0 → Hinweis + Link zu Formulare
- [ ] Quick Actions: Card/Manual Entry Flags
- [ ] Mini Stats: Leads heute, Ø/h, Pending Attachments; Tap → Stats
- [ ] Loading / Error / Empty States
- [ ] ONLINE-only, SWR-light Cache vorhanden
- [ ] DoD: typecheck/lint/build grün

## Tests/Proof (reproduzierbar)

### Backend (curl)
Exportiere eine gültige Device API Key:
- `export MOBILE_API_KEY="..."`

1) events/active:
- `curl -s -H "x-api-key: $MOBILE_API_KEY" http://localhost:3000/api/mobile/v1/events/active | jq`

2) stats/me:
- `curl -s -H "x-api-key: $MOBILE_API_KEY" "http://localhost:3000/api/mobile/v1/stats/me?range=today&tzOffsetMinutes=-60" | jq`

### Mobile (manuell)
1) Device hat Active Event + 2 Forms → Home zeigt Event/Stats; CTA öffnet Form-Sheet
2) 1 Form → CTA navigiert direkt zu Capture (/forms/[id])
3) 0 Forms → CTA zeigt Hinweis + Link zu Formulare
4) Kein Active Event → Warncard + Retry
5) API Error → Error State + Retry

## Offene Punkte/Risiken
- P1: Leads Tab zeigt lokale Recents erst, wenn Capture-Flow Recents speichert (separater Mini-TP)
- P1: Pending Attachments ist MVP-count (BUSINESS_CARD_IMAGE heute) – OCR “completed” filter später verfeinern

## Next Step
- Lokal ausführen: typecheck/lint/build + Mobile Smoke (dein Device)
- Commit + Push (Hashes ergänzen)
