# LeadRadar2026A – Admin UI Screens

Stand: 2026-01-02  
Design: Apple-clean (reduziert, robust, klare States) — Notion Elemente nur wo nötig.

---

## Screen: Exports (`/admin/exports`) — TP 1.8

Ziel:
- Admin kann CSV Export (Leads) starten
- Jobs sehen (Status + Zeitstempel)
- Download sobald DONE
- Fehlerstates zeigen traceId + Retry

API Wiring:
- Create: `POST /api/admin/v1/exports/csv`
- List: `GET /api/admin/v1/exports?type=CSV`
- Status: `GET /api/admin/v1/exports/:id` (Polling)
- Download: `GET /api/admin/v1/exports/:id/download`

UX States:
- Loading: “Loading exports…”
- Empty: “No exports yet…”
- Error Banner: message + `traceId`
- Poll Button: aktiviert solange Job nicht DONE/FAILED
- Download Button: aktiv bei DONE

Dev Tenant Context:
- `x-tenant-slug` Header (curl)
- UI: optional localStorage helper `leadradar.devTenantSlug` oder `DEV_TENANT_SLUG` env

