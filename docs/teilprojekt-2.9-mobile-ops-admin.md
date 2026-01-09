# Teilprojekt 2.9 — Mobile Ops Admin (ApiKeys/Devices/Assignments) + Demo Capture Key UX (MVP)

Status: DONE ✅  
Datum: 2026-01-09  
Commit(s): <TO_FILL_AFTER_PUSH>

---

## Ziel

Mobile Ops im Admin produktfähig machen (Operations-Fokus, kein UX-Polish):

- ApiKeys: listen, erstellen (Klartext nur 1x), revoke
- Devices: listen, verwalten (rename, enable/disable)
- Assignments: Device ↔ Forms (Replace-Strategy)
- Demo Capture: DEV Key UX (localStorage + optional `?key=` Quick-Apply)

---

## Umsetzung (Highlights)

- **Mobile Ops Screen** `/admin/settings/mobile`
  - ApiKeys Table + Create Modal (One-time token + Copy + “Use for Demo Capture”)
  - Devices Table + Manage Drawer (Rename/Status + Assignments Checklist)
  - Assignments default: nur `ACTIVE` Forms; optional Toggle “Show drafts/archived”
  - Replace-Strategy Save (PUT assignments) mit Fallback auf legacy Path (falls vorhanden)

- **Demo Capture DEV UX**
  - Key required Hinweis, wenn kein Key gesetzt ist
  - Key Sources:
    - LocalStorage `leadradar.devMobileApiKey` (neu)
    - LocalStorage `lr_demo_capture_mobile_api_key` (legacy)
    - URL `?key=` (übernimmt Key → speichert → URL cleanup)
  - Hydration-safe: initial state wird erst in `useEffect` aus localStorage/URL geladen

---

## Dateien / Änderungen

- `src/app/(admin)/admin/settings/mobile/MobileOpsClient.tsx`
- `src/app/(admin)/admin/demo/capture/CaptureClient.tsx`
- `docs/LeadRadar2026A/03_API.md`
- `docs/LeadRadar2026A/04_ADMIN_UI.md`
- `docs/LeadRadar2026A/04_RUNBOOK.md`
- `docs/teilprojekt-2.9-mobile-ops-admin.md`

---

## Akzeptanzkriterien – Check

- ✅ Admin kann ApiKeys listen + erstellen (token nur 1x) + revoke
- ✅ Admin kann Devices listen + verwalten (rename/status)
- ✅ Assignments (Replace-Strategy) tenant-safe
- ✅ Demo Capture kann Key bequem übernehmen (DEV) und Forms laden
- ✅ Lead Submit via Demo Capture erzeugt Lead → sichtbar in `/admin/leads`
- ✅ Revoke Key blockiert Mobile Calls reproduzierbar (401)
- ✅ `typecheck/lint/build` grün, Docs aktualisiert, `git status` clean, push

---

## Tests / Proof (reproduzierbar)

### 1) Quality Gates
```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build

