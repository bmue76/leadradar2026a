Schlussrapport (für Masterchat) — TP 4.6: Tenant Accent Color (Branding API + Mobile Consumption) — DONE ✅

Datum: 2026-01-26 (Europe/Zurich)
Status: DONE ✅ (typecheck/lint/build grün)
Final HEAD: 2a9e106 — fix(tp4.6): cleanup home/header + branding route; ignore local dev artifacts

Ziel

Tenant-Branding um Accent Color erweitern, sodass:

Admin den Akzent setzen/entfernen kann (#RRGGBB oder null)

Mobile den Akzent zuverlässig über einen Branding-Endpoint erhält

Validierung & Fehlermeldungen sauber sind (400 + traceId + fieldErrors)

Umsetzung
A) DB / Prisma

Neues Feld: Tenant.accentColor (nullable)

Migration hinzugefügt, Schema synchron

B) APIs

Admin

PATCH /api/admin/v1/tenants/current/branding

{ "accentColor": "#0A84FF" } → setzt Akzent

{ "accentColor": null } → entfernt Akzent

Ungültig (z.B. "red") → 400 INVALID_BODY + fieldErrors + traceId

Mobile

GET /api/mobile/v1/branding

Payload enthält tenant.accentColor zusätzlich zu Logo-/Branding-Metadaten

C) Cleanup / Repo Hygiene

TS/Lint-Cleanup in Mobile/UI + Branding Route

.gitignore ergänzt (lokale Temp/Dev-Artefakte), Repo wieder clean

Commits

e328611 — feat(tp4.6): add tenant accentColor field

8ef9c75 — feat(tp4.6): tenant accentColor branding APIs

5beddc9 — fix(tp4.6): remove any from provision + cleanup powered-by

2a9e106 — fix(tp4.6): cleanup home/header + branding route; ignore local dev artifacts (Final)

Akzeptanzkriterien – Check ✅

✅ Admin kann Accent setzen/entfernen

✅ Mobile erhält Accent via Branding API

✅ Validierung korrekt (400 + fieldErrors + traceId)

✅ typecheck/lint/build grün

✅ Repo clean, push erfolgt

Tests / Proof (lokal, reproduzierbar)
npm run typecheck
npm run lint
npm run build


API Smoke (Beispiel)

Admin setzt Accent → Mobile sieht Accent → Admin entfernt Accent → invalid Accent → 400 INVALID_BODY inkl. traceId ✅