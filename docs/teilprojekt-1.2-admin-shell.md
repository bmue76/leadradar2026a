# Teilprojekt 1.2 — Admin Shell + Navigation + WhoAmI/Tenant Badge (erster Screen) — Schlussrapport

Titel: Teilprojekt 1.2 — Admin Shell + Navigation + WhoAmI/Tenant Badge  
Status: DONE  
Datum: 2026-01-01  
Commit(s): TODO (nach Commit/Push eintragen)

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
  - lädt Tenant über `adminFetchJson`
  - zeigt bei Fehlern traceId (Support-fähig)
- `adminFetchJson` setzt immer `x-tenant-slug` (DEV: localStorage → fallback env)
- Placeholder Pages sauber (Coming-soon, CTA zurück zum Dashboard)

## Dateien/Änderungen
- `src/app/(admin)/admin/layout.tsx`
- `src/app/(admin)/admin/page.tsx`
- `src/app/(admin)/admin/forms/page.tsx`
- `src/app/(admin)/admin/leads/page.tsx`
- `src/app/(admin)/admin/exports/page.tsx`
- `src/app/(admin)/admin/recipients/page.tsx`
- `src/app/(admin)/admin/settings/page.tsx`
- `src/app/(admin)/admin/_components/AdminShell.tsx`
- `src/app/(admin)/admin/_components/AdminShell.module.css`
- `src/app/(admin)/admin/_components/SidebarNav.tsx`
- `src/app/(admin)/admin/_components/Topbar.tsx`
- `src/app/(admin)/admin/_components/TenantBadge.tsx`
- `src/app/(admin)/admin/_components/UiState.tsx`
- `src/app/(admin)/admin/_lib/adminFetch.ts`
- `docs/LeadRadar2026A/04_ADMIN_UI.md`
- `docs/teilprojekt-1.2-admin-shell.md`

## Akzeptanzkriterien – Check
- [x] `/admin` lädt ohne Errors
- [x] TenantBadge: ok → Tenant sichtbar / invalid → Error inkl. traceId + Retry
- [x] Navigation funktioniert + Active State
- [x] UX States (Loading/Empty/Error) sauber, keine rohen JSON-Objekte
- [ ] `npm run typecheck` grün (lokal ausführen)
- [ ] `npm run lint` grün (lokal ausführen)
- [ ] `npm run build` grün (lokal ausführen)
- [ ] Doku + Schlussrapport committed, git status clean

## Tests/Proof (reproduzierbar)
1) `npm run dev`
2) `http://localhost:3000/admin`
   - Sidebar + Topbar sichtbar
   - TenantBadge zeigt z.B. “Atlex GmbH (atlex)” bei korrektem slug
   - Bei falschem slug: Error State mit traceId + Retry
3) Kontroll-Call:
   - `curl -i -H "x-tenant-slug: atlex" http://localhost:3000/api/admin/v1/tenants/current`

## Offene Punkte/Risiken
- P0: Falls Admin-APIs lokal zusätzlich Auth-Header verlangen (z. B. `x-user-id`), DEV Env setzen.
- P1: Nächster Screen: Forms List (TP 1.3) – nutzt bestehende Admin Contracts.

## Next Step
TP 1.3 — **Admin Forms List** (read + status chips + empty state + CTA “Create form”).
