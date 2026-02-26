# Teilprojekt 8.3 (Light): Executive Messebericht — Struktur & Teaser (Pre-GoLive)

Status: READY (nach Commit/Push)  
Datum: 2026-02-26  
Commit(s): TBD

---

## Ziel

Vorbereitung der Struktur für den zukünftigen **Executive AI Messebericht (Level B Premium)** als **Premium-Teaser** in der Admin UI.

Out of Scope (bewusst):
- Keine AI-Integration
- Keine PDF-Engine
- Keine DB-Erweiterung
- Kein Usage-Gate
- Kein Snapshot
- Keine API / kein Backend

In Scope:
- Navigation + neuer Screen + Premium-Teaser
- Docs aktualisieren
- typecheck/lint/build grün

---

## Umsetzung (Highlights)

- Sidebar um **Reports** erweitert (eigene Rubrik, nicht unter Performance verschachtelt).
- Statistik/Performance Nav-Label vereinheitlicht: **Performance** (Route bleibt `/admin/statistik`).
- Neuer Screen `/admin/reports/executive` als ruhiger, glaubwürdiger Premium-Teaser:
  - Hero mit Beta-Badge und klarer Subline
  - Section “Was Sie erwartet” mit Bulletpoints
  - Testphase-Callout mit einzigem CTA “Feedback geben” (mailto)

---

## Dateien/Änderungen

- `src/app/(admin)/admin/_components/SidebarNav.tsx`
  - Neue Gruppe “Reports”
  - “Statistik” → “Performance” (Label/UI)
- `src/app/(admin)/admin/_components/icons.tsx`
  - Neues Icon: `IconReports`
- `src/app/(admin)/admin/statistik/page.tsx`
  - Titel: “Performance” (ruhig, ohne Route-Änderung)
- `src/app/(admin)/admin/reports/executive/page.tsx`
  - Neuer Teaser-Screen
- `docs/LeadRadar2026A/04_ADMIN_UI.md`
  - Neuer Screen dokumentiert + Stand aktualisiert

---

## Akzeptanzkriterien – Check

- [ ] Keine Type Errors (`npm run typecheck`)
- [ ] Keine Lint Errors (`npm run lint`)
- [ ] Build grün (`npm run build`)
- [ ] Navigation konsistent (Reports eigenständig, Performance benannt)
- [ ] UI wirkt Premium (ruhig, kein Fake-Generate)
- [ ] Kein toter Code / keine Backend Calls
- [ ] Docs aktualisiert
- [ ] Commit gepusht

---

## Tests/Proof (reproduzierbar)

Commands:
- `npm run typecheck`
- `npm run lint`
- `npm run build`

Manuell UI:
1) `/admin` öffnen → Sidebar zeigt **Performance** und **Reports**
2) Klick **Reports → Executive Messebericht (Beta)** → `/admin/reports/executive`
3) CTA “Feedback geben” öffnet Mail-Client (mailto)

---

## Offene Punkte/Risiken (P0/P1/…)

- P1: Mail-Adresse für Beta-Feedback final klären (derzeit `support@leadradar.ch` als Platzhalter).
- P1: Beta-Positionierung mit Testgruppe validieren (Wording, Erwartungshaltung, “Wann kommt das?” Trigger).

---

## Next Step

- Testgruppen-Feedback auswerten (Verständlichkeit, erwartete Inhalte, Priorität).
- Danach (separates TP, Level B): AI-Generierung + PDF-Engine + Usage Gate + Snapshot/Exports.
