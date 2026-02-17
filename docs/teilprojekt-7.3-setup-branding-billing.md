# Teilprojekt 7.3 — Setup → Branding (Logo Upload + Accent) + Billing/Accounting Split + Accent Tokens — ONLINE-only (GoLive MVP)

Status: DONE ✅  
Datum: 2026-02-17  
Commit(s):
- `aba84ad` — feat(tp7.3): add billing/accounting screen + nav; redirect /admin/branding
- `c3a1f7f` — fix(tp7.3): split branding vs billing fields; align /admin layout
- `027ff67` — fix(tp7.3): canonicalize billing route + restore accent in nav and focus

## Ziel

- **Branding Screen** bleibt unter **/admin/settings/branding** (Setup → Branding).
- **Firma/Rechnungsadresse & Ansprechpartner** werden **aus Branding entfernt** und in einen klaren Bereich **Billing/Accounting** verschoben.
- **Abo-/Billing-Bereich** bekommt einen Menüpunkt / Screen, um spätere Themen wie Ownership-Transfer sauber zu verorten.
- **Akzentfarbe** wirkt wieder sichtbar im Admin (SideNav + Focus “Schein”) und bleibt kompatibel mit Mobile (TabBar active tint).

## Umsetzung (Highlights)

- **Routing/IA**
  - Canonical: `/admin/billing/accounting`
  - Legacy: `/admin/settings/billing` → redirect auf canonical
  - Legacy: `/admin/branding` → redirect auf `/admin/settings/branding`
- **Branding**
  - Enthält nur noch: Logo Upload/Preview + Akzentfarbe (Tenant/Profile)
  - Firma/Rechnungsadresse + Ansprechpartner entfernt (GoLive MVP: bewusst getrennt)
- **Accent Tokens**
  - `--lr-accent` & `--lr-accent-soft` werden gesetzt (AdminAccentProvider)
  - SideNav verwendet CSS-Variablen statt hardcoded Tailwind “blue-*”
  - Globales `:focus-visible` gibt wieder den subtilen Akzent-“Glow” (Apple-clean)

## Dateien/Änderungen (wichtigste)

- `src/app/(admin)/admin/settings/branding/*` — Branding UI (ohne Billing-Felder)
- `src/app/api/admin/v1/branding/route.ts` — GET/PATCH für Branding/Profile (Zod Validation)
- `src/app/api/admin/v1/tenants/current/logo/route.ts` — Logo Upload/GET/HEAD/DELETE (tmp storage, SVG hardened)
- `src/app/(admin)/admin/billing/accounting/*` — Billing/Accounting Screen (Firma/Belege)
- `src/app/(admin)/admin/settings/billing/page.tsx` — redirect → `/admin/billing/accounting`
- `src/app/(admin)/admin/_components/AdminAccentProvider.tsx` — Accent vars (inkl. rgba soft)
- `src/app/(admin)/admin/_components/SidebarNav.tsx` — Accent im Nav
- `src/app/globals.css` — Focus-visible outline via `--lr-accent-soft`

## Akzeptanzkriterien – Check

- [x] /admin/settings/branding: Logo Upload/Preview + Akzentfarbe speichern funktioniert
- [x] Firma/Rechnungsadresse + Ansprechpartner sind NICHT mehr in Branding
- [x] /admin/billing/accounting existiert und ist der zentrale Ort für Firma/Belege
- [x] /admin/settings/billing redirectet sauber auf /admin/billing/accounting
- [x] SideNav übernimmt Akzentfarbe wieder (Dot/Active Styles)
- [x] Fokus-Ring/Glow sichtbar (subtil, Apple-clean)
- [x] Tenant-scope leak-safe (404 bei Tenant mismatch)
- [x] Typecheck/Lint/Build grün

## Tests/Proof (reproduzierbar)

### Quality Gates
- `npm run typecheck`
- `npm run lint`
- `npm run build`

### Manuelle UI Checks
1) `/admin/settings/branding`
   - Logo hochladen → Vorschau aktualisiert
   - Logo entfernen → Vorschau zeigt “Kein Logo”
   - Akzentfarbe setzen → SideNav Active/Dot + Focus Glow sichtbar
2) `/admin/billing/accounting`
   - Inhalte sichtbar, Layout wie /admin (max-w-5xl, px-6, spacing ok)
3) `/admin/settings/billing`
   - Redirect auf `/admin/billing/accounting` funktioniert

## Offene Punkte / Risiken

- P1: “Tenant Admin übergeben/übertragen” (Ownership Transfer / Mitarbeiteraustritt)
  - Konzept & UX gehört in einen dedizierten Flow (Users/Ownership), nicht in Branding.
- P2: Buttons/Chips systematisch überall auf `--lr-accent` harmonisieren (visuelles Feintuning).

## Next Step

Teilprojekt 7.4 vorschlagen:
- **Tenant Users & Ownership Transfer (MVP owner-only)**
- Klarer Flow: Owner wechseln, Admin entfernen, Audit/TraceId, leak-safe 404, UI in /admin/settings/users oder /admin/billing/accounting (je nach IA-Entscheid).
