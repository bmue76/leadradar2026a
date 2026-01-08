# Teilprojekt 2.8 — Standard-Vorlagenformular + FieldTypes erweitern (MVP, produktfähig)

Datum: 2026-01-08  
Status: DONE ✅

## Ziel
- FieldTypes MVP sauber erweitern (Select single/multi, Checkbox Default, Config-Normalisierung).
- Builder V2 stabiler: realistischere Preview/Inspector-Defaults, keine kaputten Select-States.
- Demo Capture `/admin/demo/capture` wieder zuverlässig testbar (Mobile API v1) inkl. robustem Response-Parsing.
- Reorder per Drag & Drop: persistente Reihenfolge, ohne “zurückspringen”.

## Umsetzung (Highlights)
- **Fields API Normalisierung**
  - Select/Checkbox Config vereinheitlicht (options/defaultValue) + sichere Defaults.
- **BuilderV2**
  - Inspector/Preview: sichere Default-Werte für Select/Checkbox.
- **Mobile Demo Capture**
  - `/admin/demo/capture` nutzt Mobile API v1 und toleriert unterschiedliche Response-Shapes (Array / {forms} / {data:{forms}}).
  - Mobile API Key wird im LocalStorage gehalten und via `x-api-key` gesendet.
  - Optionaler Tenant Override via `x-tenant-slug`.
- **Reorder Endpoint**
  - `POST /api/admin/v1/forms/[id]/fields/reorder` implementiert und im Hook verwendet.
  - Hook/Refresh-Logik so angepasst, dass die UI-Reihenfolge nicht durch ein Refresh “überschrieben” wird.

## Test (DEV)
- Login: `admin@atlex.ch` / `Admin1234!`
- Seed ausführen (DEV): `prisma db seed`
- Demo Capture:
  - Seed Output liefert `x-api-key` für `atlex`.
  - In `/admin/demo/capture` Key setzen → ACTIVE Forms werden geladen → Lead POST funktioniert.
- Builder:
  - Felder per Drag&Drop reorder → bleibt nach Save bestehen → kein Reload/Reset.

## Notizen / Learnings
- Mobile API braucht **x-api-key** (Admin Session allein reicht nicht).
- Bei Next.js Route Types muss `ctx.params` zur Next Typdefinition passen (sonst typecheck fail).
- Reorder darf nicht durch Refresh wieder auf “sortOrder sort” zurückfallen → UI-Order separat behandeln.

## Next Steps (TP 2.9 Vorschlag)
- Admin UI für Mobile:
  - ApiKeys erstellen/revoken
  - Devices anzeigen (lastSeenAt/lastUsedAt)
  - Form Assignments verwalten
  - Copy-to-clipboard für `x-api-key` + Quick-Link zu Demo Capture
