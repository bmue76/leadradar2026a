# Teilprojekt 2.0 – Tenant Branding (Logo Upload + Topbar/Auth Polishes)

**Status:** DONE ✅  
**Datum:** 2026-01-06  
**Commit(s):** 145bfa0, 90bc07e

---

## Ziel
Tenant Branding „echt“ implementieren:
- Logo-Upload pro Tenant (validiert, tenant-scoped, leak-safe)
- Topbar zeigt Tenant-Logo korrekt skaliert (contain, keine Verfälschung)
- Settings UI für Upload/Preview/Remove
- Auth Screens: einheitliches Branding (Logo + Layout + Link-Fixes)
- Phase 1 ONLINE-only; Storage minimal lokal (dev), später austauschbar (S3/R2)

---

## Umsetzung (Highlights)
- **DB/Prisma:** Tenant-Felder für Logo-Metadaten inkl. Migration.
- **API:** /api/admin/v1/tenants/current/logo (GET/HEAD, POST multipart, DELETE) tenant-scoped + 404 leak-safe.
- **Storage (DEV):** lokale Ablage via Storage-Stub; .tmp_branding nur lokal.
- **Admin UI:** /admin/settings/branding mit Upload/Preview/Remove.
- **Topbar:** Logo ohne Frame/Hintergrund, contain scaling.
- **Sidebar:** Logout integriert (führt auf Login).
- **Auth UI:** /login, /forgot-password, /register konsistent + /auth/* Redirects.

---

## Dateien/Änderungen
- prisma/
  - migrations/20260105185545_tenant_branding_logo/
  - seed.ts
  - seed_assets/
- public/brand/leadradar-logo.png
- src/app/api/admin/v1/tenants/current/logo/route.ts (Commit 90bc07e)
- src/app/api/auth/logout/route.ts
- src/app/(admin)/admin/_components/AdminShell.tsx
- src/app/(admin)/admin/_components/Topbar.module.css
- src/app/(admin)/admin/_components/TenantLogo.tsx
- src/app/(admin)/admin/settings/branding/page.tsx
- src/app/(admin)/admin/settings/branding/BrandingClient.tsx
- src/app/(auth)/_components/AuthShell.module.css
- src/app/(auth)/_components/BrandHeader.tsx
- src/app/(auth)/_components/BrandHeader.module.css
- src/app/auth/*

---

## Akzeptanzkriterien – Check
- [x] Apple-clean UI (ruhig, wenig Linien, keine Card-Schatten)
- [x] Placeholder/States sauber (kein Logo → sauberer State)
- [x] Upload validiert (Typ/Grösse), gespeichert pro Tenant
- [x] Topbar: contain scaling (max-height, width auto, object-fit contain)
- [x] API tenant-scoped, leak-safe (falscher Tenant/ID → 404)
- [x] Phase 1 ONLINE-only, Storage minimal lokal (dev), später austauschbar

---

## Tests/Proof (reproduzierbar)

### API Smoke
```bash
# Upload
curl -i \
  -H "x-tenant-slug: atlex" \
  -H "x-user-id: seed" \
  -X POST \
  -F "file=@prisma/seed_assets/atlex-logo.png" \
  "http://localhost:3000/api/admin/v1/tenants/current/logo"

# Fetch (Headers)
curl -I \
  -H "x-tenant-slug: atlex" \
  -H "x-user-id: seed" \
  "http://localhost:3000/api/admin/v1/tenants/current/logo"

# Remove
curl -i \
  -H "x-tenant-slug: atlex" \
  -H "x-user-id: seed" \
  -X DELETE \
  "http://localhost:3000/api/admin/v1/tenants/current/logo"
```

### UI Smoke
- /admin/settings/branding → Upload/Preview/Remove funktioniert
- /admin → Topbar zeigt Tenant-Branding
- /login, /forgot-password, /register → korrektes Logo + konsistenter Style
- /auth/login → redirect → /login (kein 404)

### Quality Gates (DoD)
```bash
npm run typecheck
npm run lint
npm run build
```

---

## Offene Punkte/Risiken
- P1: Dev-Storage (.tmp_branding) später auf Object Storage (S3/R2) umstellen.
- P1: Tenant-Name/Title hydration-safe finalisieren + Topbar final right-align (TP 2.1).

---

## Next Step
**Teilprojekt 2.1 – Admin UX Polish & Tenant Context Hardening**
- Topbar: Logo strikt rechtsbündig, Spacing final
- Title: „<TenantName> – Admin“ hydration-safe
- Tenant Context stabilisieren (keine 401/403 Turbulenzen)
