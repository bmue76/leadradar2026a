# LeadRadar2026A — Admin UI (Screens)

Stand: 2026-01-01  
Prinzip: **Screen-by-screen**, UX-polished, tenant-first.

## Zielbild
- Admin UI unter **/admin**
- Konsumiert Admin-APIs (same origin)
- **Tenant-scope non-negotiable**: Jeder Call setzt `x-tenant-slug`
- Fehler sind support-fähig: **traceId sichtbar** + Retry

## TP 1.2 — Admin Shell (Basis)
Enthält:
- Route Group: `src/app/(admin)/admin/*`
- Shell: Sidebar + Topbar + Content Slot
- Navigation: Dashboard / Forms / Leads / Exports / Recipients / Settings
- WhoAmI/Tenant Badge: `GET /api/admin/v1/tenants/current`
  - Loading / Error / Success
  - Error zeigt traceId, damit Support reproduzieren kann

## Tenant Context (DEV-only, ohne API bypass)
Die API bleibt strikt (Header muss gesetzt sein).  
Die UI sorgt nur dafür, dass der Header zuverlässig gesendet wird.

### Default
In `.env.local`:
- `NEXT_PUBLIC_DEFAULT_TENANT_SLUG=atlex`

### Optionaler Switch (DEV)
- Topbar enthält DEV-Input “Tenant slug”
- Speichert in `localStorage` unter `lr_admin_tenant_slug`
- Admin-Fetch liest in DEV zuerst localStorage, sonst `.env.local`

### Optional: Dev User Header (nur falls Backend lokal verlangt)
Wenn eure Admin-APIs lokal `x-user-id` erwarten:
- `NEXT_PUBLIC_DEV_USER_ID=dev-owner` in `.env.local`
oder über “Dev User” Button (prompt) setzen.

## UX Patterns (Pflicht)
- Loading: dezent (Spinner/Skeleton)
- Error: freundlich + traceId + Retry
- Empty: next action (CTA)
- Keine rohen JSON-Objekte im UI

## Repro / Proof
1) `npm run dev`
2) Öffnen: `http://localhost:3000/admin`
3) Erwartung:
   - Shell erscheint (Sidebar + Topbar)
   - TenantBadge zeigt Tenant (bei korrektem slug)
   - Falscher slug → Error State mit traceId + Retry

Kontroll-Call:
- `curl -i -H "x-tenant-slug: atlex" http://localhost:3000/api/admin/v1/tenants/current`
