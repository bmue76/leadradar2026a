# Teilprojekt 2.9 — Admin Mobile Ops (ApiKeys/Devices/Assignments) + Demo-Capture Key UX (MVP)

Status: DONE ✅  
Datum: 2026-01-09  
Commit(s):
- 74733ce — feat(admin): mobile ops + demo capture key ux (tp 2.9)
- 6a896c8 — fix(admin): mobile ops lint clean (tp 2.9)

---

## Ziel

Mobile Operations im Admin produktfähig machen (MVP, ops-fokussiert):

- ApiKeys & Devices verwalten, Form-Assignments pflegen (replace-strategy, tenant-safe)
- Demo Capture so verbessern, dass E2E-Tests schnell und zuverlässig laufen (DEV-only Key UX)
- Reproduzierbarer Proof: Key → Forms → Lead → /admin/leads → Revoke blockiert Mobile API

---

## Umsetzung (Highlights)

### A) Admin UI: Mobile Ops (/admin/settings/mobile)

Ops-Screen implementiert/erweitert für:

- ApiKeys: list, create (Klartext nur 1x), revoke
- Devices: list/manage, Status/Rename (falls im Screen vorhanden), Assignments pflegen
- Assignments: Device ↔ Forms Zuweisungen als Replace Strategy

Fokus: “Operations / Lösung”, kein UX-Polish.

### B) Demo Capture UX (DEV-only)

Demo Capture kann Mobile API Key bequem übernehmen:

- LocalStorage Support: `leadradar.devMobileApiKey` (und legacy key weiterhin akzeptiert)
- Optionaler `?key=...` Import (DEV convenience), danach URL cleanup
- Hydration-safe init (LocalStorage/QueryParam erst im Client-Effekt)

### C) Tenant-Scope & Leak-Safety

- Admin via `requireTenantContext(req)` tenant-scoped
- Fremde IDs / falscher Tenant → 404 NOT_FOUND (leak-safe)
- Mobile API via `x-api-key`, revoke → unauthorized (401) reproduzierbar

---

## Dateien / Änderungen

### Code

- `src/app/(admin)/admin/settings/mobile/MobileOpsClient.tsx`
- `src/app/(admin)/admin/settings/mobile/page.tsx`
- `src/app/(admin)/admin/demo/capture/CaptureClient.tsx`

### Docs

- `docs/LeadRadar2026A/03_API.md` (Mobile Ops Admin endpoints + mobile auth notes)
- `docs/LeadRadar2026A/04_ADMIN_UI.md` (Mobile Ops Screen Ergänzung)
- `docs/LeadRadar2026A/04_RUNBOOK.md` (Key handling / rotation / DEV notes)
- `docs/teilprojekt-2.9-mobile-ops-admin.md` (dieser Rapport)

---

## Akzeptanzkriterien — Check ✅

- ✅ Admin kann ApiKeys listen + erstellen (token nur 1x) + revoke
- ✅ Admin kann Devices listen/anlegen/verwalten + assignments pflegen
- ✅ Assignment Save: replace-strategy + tenant-safe + leak-safe 404
- ✅ Demo Capture übernimmt Key bequem (DEV) und lädt Forms
- ✅ Lead Submit erzeugt Lead → sichtbar in /admin/leads
- ✅ Revoke Key blockiert mobile calls (401) reproduzierbar
- ✅ typecheck/build grün; lint grün (Warnings ok); docs aktualisiert; git status clean; push

---

## Tests / Proof (reproduzierbar)

```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build
npm run db:seed

