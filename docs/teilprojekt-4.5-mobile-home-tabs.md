# Schlussrapport — Teilprojekt 4.5: Mobile Home Screen (Tabs: Home/Forms/Leads/Stats/Settings) + Home APIs — ONLINE-only (MVP)

Status: DONE ✅  
Datum: 2026-01-23

Commit(s):
- 622a8e2 — feat(tp4.5): add mobile tabs + home screen with mini stats
- 8f62f66 — docs(tp4.5): add mobile home tabs schlussrapport draft
- 5754875 — fix(tp4.5): align mobile apiFetch usage + remove any
- (neu, falls bereits gepusht) fix(tp4.5): mobile tenant logo + android tabbar safe-area

> Hinweis: Falls der letzte “Android tabbar safe-area + tenant logo” Commit noch nicht gepusht ist, bitte dessen Hash nach `git log -1 --oneline` hier oben nachtragen.

---

## Ziel

Ein produktionsreifer Home Screen für die Mobile App (Expo/React Native), der Messepersonal sofort handlungsfähig macht:

- Aktives Event sichtbar
- 1 Primary CTA “Lead erfassen” (Direktstart bei 1 Form, Formwahl bei >1)
- Quick Actions: “Visitenkarte scannen” / “Kontakt manuell hinzufügen”
- Mini-Statistik “Heute” (Tap → Stats Tab)
- Stabiler UX-State bei fehlendem Event/Form/Netzwerk
- ONLINE-only (Phase 1), aber strukturell kompatibel für spätere Offline-Outbox/Sync (Phase 2)

Home macht nur READs (Navigation ok), keine Writes.

---

## Umsetzung (Highlights)

### Mobile UI (Apple-clean)
- Tabs: Home | Formulare | Leads | Stats | Settings
- Home Screen (vertikal, grosse Tap-Zonen, wenig Text)
- Bottom-Sheet (MVP) zur Formularwahl bei mehreren Forms (ohne schwere Libs)

### Mobile Read APIs (Backend)
- `GET /api/mobile/v1/events/active` — aktives Event oder null
- `GET /api/mobile/v1/stats/me?range=today&tzOffsetMinutes=...` — Mini-Stats
- `GET /api/mobile/v1/branding` — Tenant Logo für Mobile (data-url/base64) aus Branding Store

### Branding (Mobile)
- Home Header zeigt Tenant Branding Logo (aus Admin Upload),
  Fallback auf App-Icon wenn kein Logo vorhanden.

### Android UX Fix
- Tabbar respektiert SafeArea/Bottom-Inset, um Überlagerung durch Android System Navigation zu vermeiden
- Home/Leads Screens berücksichtigen zusätzliche Bottom Padding (CTA/Buttons erreichbar)

---

## Dateien/Änderungen (Auszug)

Mobile:
- `apps/mobile/app/_layout.tsx` — Tabs + safe-area tabBar height/padding
- `apps/mobile/app/index.tsx` — Home UI + states + tenant logo + fetches
- `apps/mobile/app/leads.tsx` — MVP placeholder (kein server feature)
- `apps/mobile/src/features/home/useHomeData.ts` — typed apiFetch usage / no-any (falls vorhanden)
- `apps/mobile/src/ui/BottomSheetModal.tsx` — Bottom sheet modal (MVP)
- `apps/mobile/src/types/assets.d.ts` — asset typings für png/jpg/svg

Backend:
- `src/app/api/mobile/v1/events/active/route.ts` — Active Event read (device-auth)
- `src/app/api/mobile/v1/stats/me/route.ts` — Today stats (device-auth)
- `src/app/api/mobile/v1/branding/route.ts` — Mobile tenant branding (device-auth)

Docs:
- `docs/LeadRadar2026A/03_API.md` — aktualisiert: mobile events/active + stats/me + branding
- `docs/LeadRadar2026A/00_INDEX.md` — aktualisiert: Links TP4.0..TP4.5 + Hinweis mobile endpoints
- `docs/teilprojekt-4.5-mobile-home-tabs.md` — dieser Schlussrapport

---

## Akzeptanzkriterien – Check

- [x] Tabs vorhanden: Home | Formulare | Leads | Stats | Settings
- [x] Home zeigt aktives Event (oder Warncard + Retry)
- [x] Primary CTA:
  - [x] 1 Form → direkt zu Capture
  - [x] >1 Form → Formwahl via Bottom Sheet
  - [x] 0 Forms → Hinweis + Link zu Formulare Tab
- [x] Quick Actions:
  - [x] Visitenkarte scannen → Capture Einstieg (Flag/Param)
  - [x] Kontakt manuell hinzufügen → Capture Einstieg (Flag/Param)
- [x] Mini Stats “Heute” sichtbar, Tap → Stats Tab
- [x] Error/Network down State + Retry
- [x] ONLINE-only, Offline-ready Struktur (SWR/defensive guards, keine Outbox)
- [x] Branding: Tenant Logo im Header (Upload via Admin Settings/Branding)
- [x] Android Bottom Nav Overlay gelöst (safe-area tabbar)

---

## Tests/Proof (reproduzierbar)

### Quality Gates
- `npm run typecheck` → 0 Errors
- `npm run lint` → 0 Errors (Warnings ok)
- `npm run build` → grün

### Mobile Smoke (manuell)
1) Device hat ACTIVE Event + 2 Forms  
   → Home zeigt Event/Stats; CTA öffnet Formwahl-Sheet
2) Device hat 1 Form  
   → CTA navigiert direkt zu Capture
3) Device hat 0 Forms  
   → CTA zeigt Hinweis + Link zu “Formulare”
4) Kein ACTIVE Event  
   → Warncard sichtbar + Retry lädt neu
5) API Error (Backend down)  
   → Error Card + Retry
6) Branding Logo im Admin hochgeladen (`/admin/settings/branding`)  
   → Home Header zeigt Logo (Fallback wenn keines)

---

## Offene Punkte / Risiken

P0
- Keine.

P1
- `GET /api/mobile/v1/branding` liefert base64 Data-URL (MVP-stabil), kann bei sehr grossen Logos ineffizient werden.
  → Phase 2 Option: Signed URL / header-auth image fetch / caching, sobald Infrastruktur stabil ist.

P1
- Leads Tab ist MVP placeholder (lokaler Verlauf via AsyncStorage geplant, server-lead-list separat).

---

## Next Step

Teilprojekt 4.6 (Vorschlag):
- Mobile “Leads” Tab: local Recent Captures (AsyncStorage) + Detail Preview (read-only)
- Optional: Stats Screen ausbauen (Charts/Hourly Buckets), weiterhin read-only
- Optional: Home “License expired” UI-State finalisieren sobald Licensing Backend existiert

