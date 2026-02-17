# Teilprojekt 7.3 — Setup: Branding + Firma/Belege Split (GoLive MVP)

Status: IN PROGRESS  
Datum: 2026-02-17  
Commit(s):
- `aba84ad` — feat(tp7.3): add billing/accounting screen + nav; redirect /admin/branding
- (add your next commit hash here) — fix(tp7.3): settings branding clean split + ui polish

## Ziel

- Branding (Logo/Anzeigename/Akzentfarbe) sauber in **/admin/settings/branding**
- Firma/Rechnungsadresse + Ansprechpartner in **/admin/billing/accounting**
- Akzentfarbe wird in Admin & Mobile sichtbar genutzt
- Apple-clean UI, konsistente Page-Breite wie **/admin**

## Umsetzung (Highlights)

- **/admin/settings/branding**
  - Enthält nur Branding: Logo Upload/Remove, Anzeigename, Akzentfarbe (Presets + Color Picker + HEX/RGB/CMYK)
  - Dispatch Event `lr_tenant_branding_updated` → `AdminAccentProvider` zieht neue Accent Vars

- **/admin/billing/accounting**
  - Firma/Rechnungsadresse + UID/MWST + Ansprechpartner
  - Placeholder „Tenant-Inhaber“ (Owner Transfer folgt als eigener Flow)

- **Akzentfarbe Anwendung**
  - Admin: CSS Vars `--lr-accent` via `AdminAccentProvider` (sichtbar z.B. Topbar-Dot; später optional Buttons/Active States)
  - Mobile: `useTenantBranding` → TabBar `tabBarActiveTintColor`

## Dateien/Änderungen

- `src/app/(admin)/admin/settings/branding/page.tsx`
- `src/app/(admin)/admin/settings/branding/BrandingClient.tsx`
- `src/app/(admin)/admin/billing/accounting/page.tsx`
- `src/app/(admin)/admin/billing/accounting/AccountingClient.tsx`
- `src/app/(admin)/admin/_components/SidebarNav.tsx` (falls nötig)

## Akzeptanzkriterien – Check

- [ ] Branding Screen zeigt nur Branding (kein Firma/Adresse/Kontakt)
- [ ] Billing/Accounting Screen enthält Firma/Adresse/Kontakt
- [ ] Save persistiert via `/api/admin/v1/branding` + Logo Endpoint
- [ ] Admin Accent aktualisiert sichtbar nach Save
- [ ] Mobile nutzt Accent (Tabbar Active Tint) weiterhin stabil
- [ ] `npm run typecheck` → 0 Errors
- [ ] `npm run lint` → 0 Errors (Warnings ok)
- [ ] `npm run build` → grün

## Tests/Proof (reproduzierbar)

1) Admin UI:
- `/admin/settings/branding` → Akzentfarbe ändern → **Speichern** → Topbar-Dot ändert sich
- Logo hochladen/entfernen → Preview aktualisiert

2) Admin Billing:
- `/admin/billing/accounting` → Adresse/Kontakt speichern → Reload → Werte bleiben

3) Quality Gates:
- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Offene Punkte / Risiken

- P1: Owner Transfer Flow (Tenant-Inhaber wechseln) benötigt klares Auth/User-Modell (MVP owner-only, Rollen später).
- P1: Optional: Akzentfarbe stärker in UI nutzen (Primary Button/Active Chips) — aktuell bewusst sparsam.

## Next Step

- TP 7.3 finalisieren: Commit + Index-Eintrag + Schlussrapport.
- Danach: TP 7.4 „Tenant Owner Transfer / Admin Übergabe“ (Scope/DB/API/UI).
