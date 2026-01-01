# Teilprojekt 1.2 — Admin Shell + Navigation + WhoAmI/Tenant Badge (erster Screen) — Schlussrapport

Titel: Teilprojekt 1.2 — Admin Shell + Navigation + WhoAmI/Tenant Badge  
Status: DONE  
Datum: 2026-01-01  
Commit(s):
- d875f09 feat(admin): add admin shell + navigation + tenant badge
- d8ca88b fix(admin): tenant badge lint (react-hooks deps) — introduced TS/ESLint issues (superseded)
- fa25fd7 fix(admin): clean tenant badge props + lint rules

## Ziel
Erste kundentaugliche Admin-UI Basis unter `/admin`:
- Shell (Sidebar + Topbar + Content Slot)
- Navigation (Dashboard/Forms/Leads/Exports/Recipients/Settings)
- TenantBadge via `GET /api/admin/v1/tenants/current` inkl. Loading/Error/traceId + Retry
- DEV Tenant Context ohne API-Bypass (Header bleibt Pflicht)

## Umsetzung (Highlights)
- Admin Route Group `src/app/(admin)/admin/*`
- Polished Layout: ruhige Oberfläche, responsive Sidebar (mobile overlay)
- TenantBadge:
  - lädt Tenant über `/api/admin/v1/tenants/current`
  - Fehler zeigt traceId (Support-fähig) + Retry
- Tenant Context (DEV-only):
  - localStorage `lr_admin_tenant_slug` → fallback `NEXT_PUBLIC_DEFAULT_TENANT_SLUG`
  - UI dispatcht `lr_admin_tenant_slug_changed` für Same-Tab Updates (ohne API-Bypass)

## CI / Fixes
- Typecheck-Fehler (TenantBadge Props) + ESLint-Errors (`set-state-in-effect`, `no-explicit-any`) behoben durch fa25fd7.

## Akzeptanzkriterien – Check
- [x] `/admin` lädt ohne Errors
- [x] TenantBadge: ok → Tenant sichtbar / invalid → Error inkl. traceId + Retry
- [x] Navigation funktioniert + Active State
- [x] UX States (Loading/Empty/Error) sauber, keine rohen JSON-Objekte
- [x] `npm run typecheck` grün
- [x] `npm run lint` grün
- [x] `npm run build` grün
- [x] Doku + Schlussrapport committed, git status clean

## Tests/Proof (reproduzierbar)
1) `npm run dev`
2) `http://localhost:3000/admin`
   - Sidebar + Topbar sichtbar
   - TenantBadge zeigt z.B. “Atlex GmbH (atlex)” bei korrektem slug
   - Bei falschem slug: Error State mit traceId + Retry
3) Kontroll-Call:
   - `curl -i -H "x-tenant-slug: atlex" http://localhost:3000/api/admin/v1/tenants/current`

## Next Step
TP 1.3 — Admin Forms List (read + status chips + empty state + CTA “Create form”).
