# Schlussrapport — Teilprojekt 6.0: Setup → Branding & Mandantendaten (Logo Upload + Color Picker + Topbar)

Datum: 2026-02-03  
Status: DONE ✅  
Git: a327554 — feat(tp6.0): tenant profile + branding + topbar

## Ziel

Branding & Mandantendaten GoLive-MVP:

- Admin kann Firmenstamm / Rechnungsadresse pflegen (legalName, Adresse, Land CH default, UID/MWST optional).
- Admin kann Branding pflegen:
  - Logo als Upload (PNG/SVG) inkl. Preview
  - Accent Color via Color Picker (HEX) + Anzeige/Sync (RGB/CMYK)
- AdminShell Topbar:
  - Tenant Company Name links bündig (auf gleicher Linie/Breite wie Screen-Content)
  - Logo rechts bündig (ohne Rahmen, grösser)
  - User-Name in Topbar entfällt

## Umsetzung (Highlights)

### DB
- Neues Modell: TenantProfile (1:1, tenantId als PK/FK).
- Felder für Firmenstamm/Adresse/Ansprechpartner + accentColor.
- Migration hinzugefügt.

### API (Admin)
- GET /api/admin/v1/branding → { tenant, profile } tenant-scoped.
- PATCH /api/admin/v1/branding → Upsert/Update TenantProfile (Zod-Validation, Trim/Null, Standards jsonOk/jsonError + traceId).
- Logo Upload MVP (PNG/SVG) wird über bestehenden Endpoint /api/admin/v1/tenants/current/logo genutzt (Preview/Cache-bust via ts=...).

### UI
- /admin/branding:
  - Card „Branding“:
    - Logo Upload + grosses Preview (lokal/Server)
    - Accent Color: Color Picker + HEX + RGB + CMYK (alles synchron)
  - Cards „Firma/Rechnungsadresse“ + „Ansprechpartner“
  - Save/Reset, dirty-state, Toast „Gespeichert.“
  - Event „lr_tenant_branding_updated“ refresht Topbar live.

### Topbar Layout / Branding
- Linke Brand: LeadRadar Icon (public/brand/leadradar-icon.png) statt P-Icon.
- Tenant Name links (gleich gross wie „LeadRadar Admin“).
- Tenant Logo rechts (grösser, ohne Rahmen) und aligned zum Screen-Content (max-w-5xl px-6).

## Dateien/Änderungen

- prisma/schema.prisma (TenantProfile)
- prisma/migrations/20260203151948_tp6_0_tenant_profile_branding/
- src/app/api/admin/v1/branding/* (GET/PATCH Branding)
- src/app/(admin)/admin/branding/page.tsx
- src/app/(admin)/admin/branding/BrandingScreenClient.tsx
- src/app/(admin)/admin/_components/AdminShell.tsx
- src/app/(admin)/admin/_components/TenantTopbarBranding.tsx
- src/app/(admin)/admin/_components/TenantBrandingBlock.tsx
- src/app/(admin)/admin/_components/TenantLogo.module.css

## Akzeptanzkriterien – Check ✅

- ✅ /admin/branding lädt Profil und zeigt Felder korrekt
- ✅ PATCH speichert, Reload zeigt persistierte Werte
- ✅ Logo Upload funktioniert + Preview sauber
- ✅ AdminShell Topbar zeigt Tenant-Name links + Logo rechts nach Speichern/Upload
- ✅ Tenant-scope + API Standards (jsonOk/jsonError, traceId Header/Body) eingehalten
- ✅ DoD: typecheck/lint/build grün

## Tests/Proof (reproduzierbar)

### Commands
```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint
npm run build
```

### API Proof (curl)
GET:
```bash
curl -i -H "cookie: lr_session=DEIN_TOKEN" \
  "http://localhost:3000/api/admin/v1/branding"
```

PATCH:
```bash
curl -i -X PATCH -H "cookie: lr_session=DEIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"legalName":"Atlex GmbH","countryCode":"CH","accentColor":"#D93025"}' \
  "http://localhost:3000/api/admin/v1/branding"
```

Logo Upload (PNG Beispiel):
```bash
curl -i -X POST -H "cookie: lr_session=DEIN_TOKEN" \
  -F "file=@/d/dev/leadradar2026a/public/brand/leadradar-icon.png" \
  "http://localhost:3000/api/admin/v1/tenants/current/logo"
```

### UI Smoke
- /admin/branding öffnen → Daten laden
- Logo auswählen → Preview sichtbar
- Color Picker/HEX/RGB/CMYK testen → Werte synchron
- Speichern → Reload → bleibt
- Topbar zeigt links Tenant-Name, rechts grosses Logo

## Offene Punkte / Risiken

- P1: Einheitliche Anwendung von accentColor in weiteren Admin/UI-Komponenten (Tokens/Theming).
- P1: Optionale Logo-Validierung/Optimierung (z.B. max Dimensionen) — aktuell bewusst MVP.
- P2: Erweiterung Land-Liste (vollständig ISO2) / i18n später.

## Next Step

TP 6.1: Branding in weiteren Screens konsistent nutzen (accentColor als UI Token), optional Mobile Branding Endpoint / App Header Branding.
