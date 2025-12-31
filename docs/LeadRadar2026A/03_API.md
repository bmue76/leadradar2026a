# LeadRadar2026A – API

## Auth (Phase 1)
- Admin: Header Auth x-user-id (DEV/PoC) oder API-Key (GoLive)
- Mobile: tenantSlug Header + device binding (Activation)

## Standard Errors (Beispiele)
- UNAUTHENTICATED (401)
- FORBIDDEN (403)
- NOT_FOUND (404 leak-safe)
- INVALID_BODY / INVALID_QUERY (400)
- KEY_CONFLICT (409)
- NOT_READY / NO_FILE (409/404)

## Idempotency
- Leads: clientLeadId + tenantId unique
