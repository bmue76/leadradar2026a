# Teilprojekt 8.3 (Light): Executive Messebericht — Struktur & Teaser (Pre-GoLive)

Stand: 2026-02-26  
Status: DONE ✅ (Phase 1 / ONLINE-only)

---

## Titel + Status + Datum + Commit(s)

**Titel:** TP 8.3 (Light) — Executive Messebericht (Beta) Teaser Screen  
**Status:** DONE ✅  
**Datum:** 2026-02-26 (Europe/Zurich)  
**Commit(s):**
- 299c7dc — feat(tp8.3): add reports nav + executive report teaser screen

---

## Ziel

Vorbereitung der Struktur für den zukünftigen **Executive AI Messebericht (Level B Premium)** als **Premium-Teaser** in der Admin UI.

**Explizit nicht im Scope (bewusst):**
- Keine AI-Integration
- Keine PDF-Engine
- Keine DB-Erweiterung
- Kein Usage-Gate
- Kein Snapshot
- Keine API / kein Backend

**In Scope:**
- Navigation + neuer Screen + Premium-Teaser
- Docs aktualisieren (04_ADMIN_UI.md + Teilprojekt-Dok)
- typecheck/lint/build grün

---

## Umsetzung (Highlights)

- **Neue Rubrik „Reports“** in der Sidebar (nicht unter Performance/Statistik verschachtelt).
- Neuer Screen **`/admin/reports/executive`** als ruhiger, glaubwürdiger Premium-Teaser:
  - Hero mit Titel + **Beta** Badge + klarer Subline (Management-Report)
  - Abschnitt **„Was Sie erwartet“** mit konkreten Bulletpoints (2–5 A4 / KPI / Ranking / Empfehlungen)
  - Testphase-Callout mit **1 CTA**: „Feedback geben“ (mailto, kein Backend)
- Naming-Polish: Statistik-Screen Headline auf **„Performance“** ausgerichtet (Route bleibt `/admin/statistik`).

---

## Dateien/Änderungen

- `src/app/(admin)/admin/_components/SidebarNav.tsx`
  - Neue Gruppe „Reports“
  - Performance-Labeling im Sidebar-Bereich
- `src/app/(admin)/admin/_components/icons.tsx`
  - Neues Icon: `IconReports`
- `src/app/(admin)/admin/statistik/page.tsx`
  - Titel: „Performance“ (ruhig, ohne Route-Änderung)
- `src/app/(admin)/admin/reports/executive/page.tsx`
  - Neuer Teaser-Screen „Executive Messebericht (Beta)“
- `docs/LeadRadar2026A/04_ADMIN_UI.md`
  - Neuer Screen dokumentiert + Stand aktualisiert

---

## Akzeptanzkriterien – Check

- ✅ Keine Type Errors (`npm run typecheck`)
- ✅ Keine Lint Errors (`npm run lint`)
- ✅ Build grün (`npm run build`)
- ✅ Navigation konsistent (Reports eigenständig, nicht unter Performance)
- ✅ UI wirkt Premium (ruhig, kein Fake-Generate, keine ausgegrauten Controls)
- ✅ Kein toter Code / keine Backend Calls
- ✅ Docs aktualisiert
- ✅ Commit gepusht

---

## Tests/Proof (reproduzierbar)

### Quality Gates
```bash
npm run typecheck
npm run lint
npm run build
UI Proof (manuell)

/admin öffnen → Sidebar zeigt Reports

Klick Reports → Executive Messebericht (Beta) → /admin/reports/executive

CTA „Feedback geben“ öffnet Mail-Client (mailto)

Offene Punkte/Risiken (P0/P1/…)

P1: Mail-Adresse für Beta-Feedback final klären (derzeit support@leadradar.ch als Platzhalter).

P1: Sidebar-Polish: aktuell kann „Performance“ als Rubrik und Unterpunkt gleich benannt sein. Optional: Unterpunkt auf „Messe-Auswertung“ umbenennen (nur Label, keine Route-Änderung).

P1: Testgruppen-Validierung: Erwartungshaltung prüfen („Wann kommt das?“ Trigger) und Bulletpoints ggf. nachschärfen.

Next Step

Testgruppen-Feedback auswerten (Verständlichkeit, erwartete Inhalte, Priorität).

Danach (separates TP, Level B Premium):

AI-Generierung (Executive Summary + Empfehlungen)

PDF-Engine (2–5 Seiten)

Usage Gate / Limits

Snapshot/Exports + reproduzierbare Report-Generation
