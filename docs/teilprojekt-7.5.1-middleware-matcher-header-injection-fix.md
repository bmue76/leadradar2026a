# Teilprojekt 7.5.1 – Middleware matcher / Header-Injection Fix (POST)

Status: DONE (nach Merge/Push)  
Datum: 2026-02-19

## Ziel
Admin/UI + Admin/API Routen sollen unabhängig von HTTP-Methoden stabil Tenant/User-Kontext erhalten.
Insbesondere POST (z. B. /api/admin/v1/leads/:id/email) darf nicht mehr wegen fehlender Headers mit 401 abbrechen.

## Ausgangslage / Bug
- GET funktionierte (z. B. GET /api/admin/v1/leads/1 => 200)
- POST brach mit 401 ab, u. a.:
  - Missing x-user-id
  - Missing x-tenant-id
  - Tenant context required (x-tenant-slug header)

Ursache: Middleware war zwar vorhanden, aber
- matcher war unnötig breit (/api/:path*) und dadurch unklar “was wirklich relevant ist”
- Header-Injection setzte nicht alle benötigten Header (x-tenant-slug, x-admin-user-id fehlten)
- Token-Claim-Keys waren zu eng (z. B. nur uid/sub), wodurch trotz gültigem Token keine Header gesetzt wurden

## Umsetzung (Highlights)
- Middleware matcher präzisiert auf:
  - /admin/:path*
  - /api/admin/:path*
- Header-Injection gehärtet:
  - Setzt/passt durch: x-user-id, x-admin-user-id (Alias), x-tenant-id, x-tenant-slug, x-user-role
  - Claim-Keys liberalisiert (uid/sub/userId/id, tenantId/tid, tenantSlug/tslug/slug)
  - Method-agnostic: greift für GET/POST/PATCH/DELETE gleich
- DEV Debug Endpoint (optional):
  - /api/admin/v1/_debug/ctx (GET+POST)
  - PROD: 404
  - DEV: zeigt, welche Headers im Route Handler ankommen

## Tests / Proof (reproduzierbar)
1) Browser (eingeloggt im Admin):
   - DevTools Console:
     - await fetch("/api/admin/v1/_debug/ctx", { method: "POST" }).then(r => r.json())
   - Erwartung: data.headers.x-user-id / x-tenant-id / (falls vorhanden) x-tenant-slug != null

2) UI Smoke:
   - Admin UI → Lead Drawer → “E-Mail senden”
   - Erwartung: kein 401 mehr

3) Regression:
   - GET /api/admin/v1/leads/1/pdf weiterhin OK

## Geänderte / neue Dateien
- middleware.ts (matcher + injection hardened)
- src/app/api/admin/v1/_debug/ctx/route.ts (DEV-only)
- docs/teilprojekt-7.5.1-middleware-matcher-header-injection-fix.md

## Offene Punkte / Risiken
- Falls tenantSlug im Token nicht vorhanden ist, bleibt x-tenant-slug ggf. leer (Debug-Endpoint zeigt das sofort).
  -> In dem Fall: Token-Erzeugung (Login/Register) um tenantSlug ergänzen ODER Admin-Endpoints tenantId-first machen.
