# Teilprojekt 7.5.1 – Middleware matcher / Header-Injection Fix (POST)

**Status:** DONE ✅  
**Datum:** 2026-02-20  
**Commit(s):** COMMIT_HASH

## Ziel
Middleware muss für Admin UI + Admin API stabil laufen (auch POST) und Tenant/User Header zuverlässig setzen:
- `x-tenant-slug`
- `x-tenant-id`
- `x-user-id` / `x-admin-user-id`

## Ausgangslage / Bug
- `GET /api/admin/v1/leads/1` funktionierte (200).
- `POST /api/admin/v1/leads/1/email` brach mit 401:
  - `Tenant context required (x-tenant-slug header).`
- Debug-Route unter `/_debug/...` war 404 (Next private folders).

## Root Cause
1) Middleware injizierte zwar `x-user-id` / `x-tenant-id`, aber **kein `x-tenant-slug`**.
2) Zusätzlich war für schnelle Tests ein Debug-Endpunkt nötig; Ordner mit führendem `_` werden von Next als “private folder” behandelt und nicht geroutet.

## Umsetzung (Highlights)
- Matcher bleibt **breit** (`/api/:path*`), aber die Logik greift nur auf:
  - `/admin/*` (UI Guard)
  - `/api/admin/*` (Header Injection)
- Header-Hardening:
  - passthrough/override vorhandener Header
  - Token Claims → `x-user-id`, `x-tenant-id`, `x-user-role`, optional `x-tenant-slug`
  - `x-tenant-slug` Resolve Chain:
    1) Request header (`x-tenant-slug`)
    2) Token claim (`tenantSlug/tslug`)
    3) Cookie-Cache `lr_admin_tenant_ctx` (`<tenantId>|<tenantSlug>`)
    4) Session Resolve via `/api/admin/v1/tenants/current` (Recursion-Guard `x-mw-internal`)
    5) DEV fallback via ENV / localhost default
- DEV Debug Response Headers (für Network/curl):
  - `x-debug-mw-hit`, `x-debug-mw-tenantSlugSource`, `x-debug-mw-userIdSource`, etc.
- DEV Debug Endpoint:
  - `/api/admin/v1/debug/ctx` (PROD: 404)

## Dateien/Änderungen
- `middleware.ts`
- `src/app/api/admin/v1/debug/ctx/route.ts`
- `docs/teilprojekt-7.5.1-middleware-matcher-header-injection-fix.md`

## Akzeptanzkriterien – Check
- [x] Middleware läuft auf Admin-API **unabhängig von Method** (POST inklusive)
- [x] `x-tenant-slug` wird zuverlässig gesetzt
- [x] DEV Debug Endpoint vorhanden, PROD: 404
- [x] Smoke Test reproduzierbar dokumentiert

## Tests/Proof (reproduzierbar)
### 1) Debug (POST)
```bash
curl -i -X POST "http://localhost:3000/api/admin/v1/debug/ctx"

Erwartung:

x-debug-mw-hit: 1

JSON data.headers.x-tenant-slug gesetzt

2) Regression (PDF)

GET /api/admin/v1/leads/1/pdf?... weiterhin 200

3) Feature Fix

Admin UI → Lead Drawer → “E-Mail senden” → POST /api/admin/v1/leads/1/email = 200

Offene Punkte / Risiken

P1: In PROD sollte x-tenant-slug primär aus Session/Tenant-Resolve kommen (DEV fallbacks sind nur DEV/localhost).

Next Step

TP 7.5.2: (falls nötig) TenantSlug in Token Claims persistieren oder AdminFetch konsequent x-tenant-slug mitsenden (Defense in Depth).
