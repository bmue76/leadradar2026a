# Teilprojekt 2.8 — Standard-Vorlagenformular + FieldTypes erweitern (MVP, produktfähig)

Status: DONE ✅  
Datum: 2026-01-08  
Scope: Admin Builder V2 (Fields/Config), Mobile API v1 Demo Capture, Reorder Persistenz (API + UI), Seed Stabilität

Commit(s) (TP 2.8 relevant):
- c847ec5 feat(fields): normalize select/checkbox config + defaults (tp 2.8)
- 4641b91 feat(builder): add realistic preview + safe select defaults (tp 2.8)
- 2a9ac51 feat(fields): add reorder endpoint (tp 2.8)
- 6d9b240 fix(fields): satisfy next route handler types (reorder) (tp 2.8)
- 5c15c96 fix(builder): prevent reorder jump-back by preserving local order (tp 2.8)
- 8c83407 chore(seed): harden seed forms + rotate dev mobile api keys
- 5968020 chore: add db:seed script

---

## Ausgangslage / Problemstellung

### Demo Capture (/admin/demo/capture)
- Es wurden keine ACTIVE Forms angezeigt (“Keine ACTIVE Forms gefunden”), obwohl ACTIVE Forms existierten.
- Console zeigte `GET /api/mobile/v1/forms 401`.
- `lastUsedAt/lastSeenAt` wurden nicht aktualisiert, weil Auth nie erfolgreich war.

### FieldTypes / Config
- Select/Checkbox-Config war in der Praxis nicht robust genug (Defaults/Optionen uneinheitlich).
- Resultat: instabile UI-States und Edge-Case-Fehler.

### Reorder im Builder
- Beim Umsortieren (Drag&Drop) sprang die Reihenfolge zurück bzw. die Seite wirkte wie “neu geladen”.
- Root Cause:
  - Reorder Save schlug zuerst mit **405** fehl (fehlender Endpoint).
  - Danach “jump-back” durch `refresh()` / Order-Reset.

---

## Zielsetzung (TP 2.8)

1) FieldTypes MVP erweitern + Config Normalisierung
- `SINGLE_SELECT`, `MULTI_SELECT`: Options stabil
- `CHECKBOX`: Default stabil

2) Demo Capture muss zuverlässig Leads über Mobile API v1 erzeugen können.

3) Reorder persistieren
- Backend Endpoint `.../fields/reorder`
- UI/Hook so, dass nach Save nichts zurückspringt.

---

## Umsetzung (Highlights)

### 1) Mobile API Auth / Demo Capture: “Warum 401 trotz Admin Login?”
Wichtiges Learning:
- `/api/mobile/v1/*` ist **nicht** Admin Session-authentifiziert, sondern **ausschließlich** über `x-api-key` (Mobile Device Auth).
- Darum: Admin login “atlex” ≠ Zugriff auf Mobile API.

Fix / Vorgehen:
- Seed liefert pro Tenant eine gültige Mobile API Key + Device + Assignment.
- Demo Capture UI verlangt (DEV) explizit den Key und sendet ihn als `x-api-key`.
- Zusätzlich: Tenant Override optional via `x-tenant-slug` (für DEV).

Resultat:
- `GET /api/mobile/v1/forms` liefert nun nicht mehr 401, sondern die **assigned ACTIVE Forms**.

---

### 2) Seed hardening + db:seed script
`prisma/seed.ts` robust gemacht:
- Tenants + Users upsert
- Seed Form upsert (ACTIVE)
- Device + ApiKey + Assignment pro Tenant (rotate / dev-only output)

Zusätzlich:
- `db:seed` Script ergänzt, damit `npm run db:seed` funktioniert.

Ergebnis:
- Seed ist repeatable, liefert konsistente Testdaten und eine verlässliche DEV-Key Ausgabe.

---

### 3) Demo Capture Stabilität: Response Shapes + Empty Handling
Problem:
- CaptureClient war teils auf eine Payload-Form fixiert → Crash
  - `Cannot read properties of undefined (reading '0')`
  - wenn Forms nicht wie erwartet ankamen.

Fix:
- Payload Parsing tolerant:
  - `[...]`
  - `{ forms: [...] }`
  - `{ data: { forms: [...] } }`
- Sicheres Defaulting: wenn keine Forms → UI zeigt Hinweis, **kein Crash**.

Ergebnis:
- `/admin/demo/capture` ist wieder zuverlässig nutzbar.

---

### 4) FieldTypes/Config: normalize select/checkbox config + defaults
Konfiguration in Admin API normalisiert:
- Select: `config.options` (`string[]`)
- Checkbox: `config.defaultValue` (`boolean`)

Dazu passende sichere Defaults im Builder/Preview.

Ergebnis:
- Weniger “undefined/edge case” UI-Zustände, konsistenter DB-State.

---

### 5) Reorder Persistenz: Endpoint + Hook + Jump-Back Fix

#### 5.1 Problem 405
Beim Drag&Drop Save kam:
- `POST /api/admin/v1/forms/<id>/fields/reorder 405`

Fix:
- Route implementiert:
  - `src/app/api/admin/v1/forms/[id]/fields/reorder/route.ts`

#### 5.2 Next.js Route Types (Next 16)
Typecheck error:
- `context.params` ist in Next 16 ein Promise (App Router Type Validator)

Fix:
- Handler Signatur kompatibel gemacht (params await).

#### 5.3 Jump-Back nach Save
Problem:
- Nach erfolgreichem Save “springt” UI zurück, weil `refresh()` die order state wieder auf `sortFieldsStable(fields)` setzte.

Fix im Hook (`useFormDetail`):
- Lokale Order wird bewahrt, wenn `orderDirty` bzw. wenn eine lokale Order existiert.
- `refresh()` überschreibt Order nicht blind, sondern merged:
  - bestehende IDs beibehalten
  - neue IDs appended
  - gelöschte IDs entfernt

Ergebnis:
- Kein UI reset nach Save.
- Reorder bleibt stabil, kein “Reload Feeling”.

---

## Testplan (DEV) / Verifikation

### Seed
- `npm run db:seed`
- Ausgabe liefert `x-api-key` pro Tenant (demo + atlex)

### Admin
- Login: `admin@atlex.ch / Admin1234!`
- Form erstellen / Vorlage auswählen / editieren: ✅

### Demo Capture
- `/admin/demo/capture`
- Mobile API Key (DEV) einfügen → Apply
- Erwartung:
  - Forms werden gelistet (ACTIVE + assigned)
  - Form auswählen → Detail lädt
  - Submit → Lead gespeichert
  - Check: `/admin/leads` zeigt Eintrag ✅

### Builder Reorder
- `/admin/forms/[id]`
- Drag&Drop reorder → bleibt persistent ✅
- Kein Zurückspringen nach Save ✅

---

## Known Notes / Guardrails

- Mobile API v1 ist bewusst getrennt von Admin Auth:
  - Admin Login reicht nicht.
  - Es braucht `x-api-key` (device-bound) — genau so soll es sein.
- Demo Capture ist ein interner DEV Screen:
  - darf “roh” sein, muss aber zuverlässig laufen,
  - weil er Content für `/admin/leads` & Export erzeugt.

---

## Next Step (Vorschlag TP 2.9)

Admin UI für Mobile Ops

ApiKeys:
- Create (inkl. Device optional)
- Revoke (DISABLE device)
- Anzeigen: prefix, status, lastUsedAt

Devices:
- name, status, lastSeenAt, apiKey prefix

Assignments:
- Device ↔ Forms zuweisen/entfernen

Bonus:
- Copy-to-clipboard `x-api-key`
- Quick-Link zu `/admin/demo/capture` mit Hinweis “Key required”
