# Schlussrapport — Teilprojekt 7.3: Branding vs Billing/Accounting (GoLive MVP)

Status: DONE ✅  
Datum: 2026-02-17  
Branch: main

## Ziel

- Branding (Logo/Akzentfarbe) strikt trennen von Billing/Accounting (Firma/Rechnungsadresse/Belege).
- Canonical Route für Billing/Accounting definieren und UI (Admin Layout + SideNav) konsistent halten.
- Inputs und Focus-Styling zentralisieren (Akzentfarbe tenant-basiert).

## Umsetzung (Kurz)

- Neue Screen-Struktur:
  - **/admin/settings/branding** → Branding (Logo + Akzentfarbe)
  - **/admin/billing/accounting** → Firma/Belege/Kontakt (Tenant Admin / Übergabe später)
- Zentralisierte Inputs via `_ui/Input.tsx`.
- Accent-Focus (Ring/Shadow) und Buttons tenant-basiert (`--lr-accent` / `--lr-accent-soft`).
- SideNav Active-State: Parent/Child korrekt (kein Doppel-Active mehr).

## Wichtige Dateien

- `src/app/(admin)/admin/settings/branding/BrandingSettingsClient.tsx`
- `src/app/(admin)/admin/billing/accounting/AccountingClient.tsx`
- `_ui/Input.tsx` (zentraler Input/Select)
- SideNav Active-State Fix (bereits erledigt)

## Commits (TP7.3)

- `aba84ad` — add billing/accounting screen + nav; redirect /admin/branding
- `c3a1f7f` — split branding vs billing fields; align admin layout
- `027ff67` — canonicalize billing route + restore accent in nav and focus
- `27ea0b9` — use tenant accent for buttons + focus rings
- `597a310` — migrate branding/accounting to central inputs

## Quality Gates

- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run build` ✅

## Offene Punkte (P1 / später)

- Tenant-Inhaber Übertragung (Mitarbeiteraustritt / Owner-Transfer Flow) → **TP7.4+**
- Optional: API Split (`/branding` vs `/billing`) → später, MVP bleibt über `/api/admin/v1/branding`
