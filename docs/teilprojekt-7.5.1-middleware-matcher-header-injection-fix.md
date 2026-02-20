# Teilprojekt 7.5.1 — Middleware matcher / Header-Injection Fix (POST) + Leads E-Mail/PDF Stabilisierung
Status: DONE ✅  
Datum: 2026-02-20

## Commit(s)
- 3e544e0 — fix(tp7.5.1): remove explicit any in middleware/proxy
- 2d9ef9c — fix(tp7.5.1): prisma helper without datasourceUrl (typed never)
- c862f89 — fix(tp7.5.1): leads email/pdf ui polish + admin leads layout wrapper

> Hinweis: c862f89 nach dem finalen Commit ersetzen.

---

## Ziel
- Middleware muss für **alle relevanten Admin/UI + Admin/API Routen** greifen – unabhängig von HTTP-Methoden (GET/POST/PATCH/DELETE).
- Admin API muss stabil Tenant/User Context sehen:
  - `x-tenant-slug`
  - `x-tenant-id`
  - `x-user-id` / `x-admin-user-id`
- DEV Debug: schneller Proof, welche Header effektiv ankommen.
- Leads: E-Mail Weiterleitung inkl. optionalem PDF-Anhang + PDF Download stabil und GoLive-tauglich.

---

## Umsetzung (Highlights)
### Middleware / Context
- Matcher und Header-Injection robust gemacht, so dass POST nicht “verloren” geht.
- DEV Debug Endpoint `/api/admin/v1/debug/ctx` für schnelle Smoke-Tests (Header/Method/Path sichtbar).
- Dev-Fallbacks (nur DEV) ermöglichen Proof via curl ohne Session-Cookies.

### PDF
- PDF Rendering stabilisiert (Turbopack/Font-FS-Probleme eliminiert via pdf-lib).
- PDF-Dateiname nachvollziehbar (statt `lead-1.pdf`) über serverseitige Filename-Builder.

### Leads UI
- `/admin/leads` wieder auf Admin-Layoutstandard wie `/admin` gebracht:
  - Wrapper: `mx-auto w-full max-w-5xl px-6 py-6`
  - Header in `page.tsx`, Content in Client
- E-Mail UI:
  - Checkbox “PDF als Anhang mitsenden”
  - Buttons im Tenant Accent (Fallback vorhanden)

---

## Dateien/Änderungen (Scope)
- middleware / proxy: Header-Injection / Debug-Header / Matcher-Hardening
- src/app/api/admin/v1/debug/ctx (DEV-only)
- src/app/api/admin/v1/leads/[id]/email/route.ts (PDF attachment Hook, robust)
- src/app/api/admin/v1/leads/[id]/pdf/route.ts + src/app/api/admin/v1/pdf/lead/route.ts (PDF generation)
- src/server/pdf/leadPdf.ts (pdf-lib renderer)
- src/lib/email/mailer.ts (SMTP/log mode, attachments support)
- src/app/(admin)/admin/leads/page.tsx + LeadsClient.tsx (Layout + UI)

---

## Akzeptanzkriterien — Check ✅
- Middleware greift auch bei POST → Admin API erhält Tenant/User Header.
- DEV Debug liefert erwartete Headerwerte.
- Admin UI: Lead Drawer → “E-Mail senden” funktioniert ohne 401.
- PDF Download funktioniert und liefert sinnvollen Namen.

---

## Tests/Proof (reproduzierbar)
1) DEV Debug:
   - `curl -i -X POST "http://localhost:3000/api/admin/v1/debug/ctx"`
   - Erwartung: `x-debug-mw-hit: 1` + `x-tenant-slug/x-tenant-id/x-user-id` gesetzt (DEV fallback oder Session)

2) UI Smoke:
   - `/admin/leads` → Lead öffnen → Checkbox “PDF als Anhang mitsenden” → “E-Mail senden”
   - Erwartung: 200 OK, kein 401/404

3) Regression:
   - `GET /api/admin/v1/leads/<id>/pdf?disposition=attachment` → 200

---

## Offene Punkte / Risiken
- P1: SMTP Konfiguration/Produktionsbetrieb (ENVs) separat im Ops/Runbook dokumentieren.

---

## Next Step
- TP 7.6: Leads/PDF optisch finalisieren (Header: TenantLogo + Event + Formularname) und E-Mail Template final “GoLive clean”.
