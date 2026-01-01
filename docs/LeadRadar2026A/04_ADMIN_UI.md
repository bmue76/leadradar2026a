# LeadRadar2026A — Admin UI

Stand: 2026-01-01  
Ziel: Kundentaugliches Admin-Backend (Apple-clean Basis, Notion-Elemente nur wo nötig: Tabellen/Exporte/Rules/Analytics).

---

## Grundprinzipien
- **Tenant-scope (non-negotiable):** Admin UI ruft tenant-owned Daten nur tenantId-scoped ab. UI nutzt `adminFetchJson` und setzt `x-tenant-slug`.
- **Leak-safe:** Falscher Tenant/ID → `404 NOT_FOUND` (keine Hinweise).
- **API Standard Responses:** `jsonOk/jsonError` inkl. `traceId` im Body + `x-trace-id` Header. UI zeigt `traceId` im Error-State.
- **UX Polish von Anfang an:** Loading/Empty/Error States, klare CTA, saubere Focus States, Accessible Modal Behaviour.

---

## Screen Map (Admin)
### TP 1.2 — Admin Shell (DONE)
- Shell: Sidebar + Topbar + Content Slot
- Navigation: Dashboard / Forms / Leads / Exports / Recipients / Settings
- TenantBadge: `GET /api/admin/v1/tenants/current` inkl. Loading/Error/Retry + traceId

### TP 1.3 — Forms List (DONE)
Route: `/admin/forms`

**Features**
- List: `GET /api/admin/v1/forms`
- Search: query `q` (debounced ~320ms)
- Status Filter: `status` (DRAFT/ACTIVE/ARCHIVED)
- Create Form: Modal → `POST /api/admin/v1/forms`
- Row Action: “Open” → `/admin/forms/[id]` (Placeholder bis TP 1.4)

**UX States**
- Loading: Skeleton rows
- Empty: Erklärung + CTA “Create your first form”
- Error: freundlich + `traceId` + Retry Button

**Accessibility Basics**
- Labels an Inputs
- Modal: ESC schliesst, Enter submit (bei valid), Focus auf Name Input

---

## Wiederverwendbare Patterns
### adminFetchJson
- Single source of truth für Tenant Header (`x-tenant-slug`)
- UI zeigt Fehler als Text + `traceId`, niemals rohe JSON.

### Error Display
- Standard: Titel, Message, `traceId`, Retry.
- Optional: “Back to dashboard” Link.

---

## Nächste Schritte
### TP 1.4 — Form Detail Screen
- Form Detail + Fields Liste
- Fields CRUD (create/update/delete)
- Sort/Reorder UI
- Proof: UI + curl sanity + Quality Gates
