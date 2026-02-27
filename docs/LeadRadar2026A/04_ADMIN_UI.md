# LeadRadar2026A — Admin UI

Stand: 2026-02-26
Scope: Screen-by-screen, GoLive-ready

---

## /admin — Event Übersicht (TP 8.1)

**Purpose**
/admin ist der erste Screen nach Login und bildet das operative Cockpit eines laufenden Events ab.
Kein Admin-Panel, kein Setup-Wizard, kein KPI-Dashboard.

**Leitplanken (verbindlich)**
- Pro Screen exakt **1 Primary Action**
- Dominante Hauptinformation (Event + Leads heute)
- Keine Status-Chip-Orgie, keine Quick-Action-Wolke, keine Checkliste
- Farbe nur funktional (Primary CTA / Status-Dot)
- System spricht nur bei Problemen (Error State mit TraceId/Hint)

### Struktur (Wireframe)

1) **Hero — Event Command Header (Above the fold)**
- Event Name (dominant)
- Status: LIVE / BEREIT / KEIN AKTIVES EVENT (ruhig + Dot)
- Leads heute (groß)
- Summary-Zeile: Geräte aktiv · Formulare aktiv · Letzte Aktivität
- Rechts: **1 Primary CTA**
  - A: Event erstellen
  - B: Gerät verbinden
  - C: Event öffnen

2) **Performance Snapshot (Heute)**
- Leads heute
- Mit Visitenkarte
- Exporte
- Optional: ruhiger Mini-Chart (Leads pro Stunde)

3) **Aktivität**
Finder-Style Liste, Rows klickbar:
- Lead erfasst
- Gerät aktiv
- Export abgeschlossen

### State-Matrix

A) **Kein aktives Event**
- status: KEIN AKTIVES EVENT
- Primary CTA: Event erstellen
- Feed: Empty (“Noch keine Aktivität.”)

B) **Event aktiv, keine Geräte aktiv**
- status: BEREIT
- Primary CTA: Gerät verbinden

C) **Event läuft**
- status: LIVE
- Primary CTA: Event öffnen

### Datenquellen / Aggregation (UI-only)

TP 8.1 fügt **keine neuen Endpoints** hinzu.
Aggregation erfolgt serverseitig im Page-Render via Prisma (read-only):

- Active Event: latest Event mit status=ACTIVE (tenant-scoped)
- Active Devices: Aktiv-Fenster 15min
- Active Forms: forms status=ACTIVE
- Leads heute: leads capturedAt in “today (Europe/Zurich)”, isDeleted=false
- Visitenkarte: leadAttachments type=IMAGE heute
- Exporte: exportJobs DONE heute
- Activity Feed: merge/sort aus recent leads/devices/exports (DONE)

### Proof (manuell)

1) State A: kein ACTIVE Event → CTA “Event erstellen”
2) State B: ACTIVE Event, aber kein online Device → CTA “Gerät verbinden”, status “BEREIT”
3) State C: ACTIVE Event + online Device → CTA “Event öffnen”, status “LIVE”

Quality gates:
- npm run typecheck
- npm run lint
- npm run build

---

## /admin/statistik — Premium Messe Performance Center (TP 8.2)

**Purpose**
Messeleiter öffnet /admin/statistik (Sidebar: **Performance**) und erkennt sofort: Peak-Zeiten, Geräte-/Team-Performance, Lead-Qualität — optional live.

**Leitplanken (verbindlich)**
- Apple-clean, ruhig, Premium SaaS
- 1 Primary Action
- Farbe nur funktional (Live/Pause/Error)
- Keine KPI-Karten-Orgie
- Kein Setup-Flow, kein Systemstatus-Rehash
- tenant-scoped + leak-safe 404

**Legacy Routing**
- `/admin/stats` → Redirect auf `/admin/statistik` (Backwards Compatibility)

### Struktur (Wireframe)

1) **Executive Header (Above the fold)**
- Event Name
- Zeitraum-Selector: Heute | Gestern | Gesamte Messe | Custom
- Dominante Zahl: `128 Leads`
- Sekundärzeile: `+18% vs. gestern · 32% qualifiziert · 4 Geräte aktiv · Peak: 14–15 Uhr`
- Rechts oben: Live Toggle **Live / Pausiert**
- Primary CTA (MVP): **Leads öffnen** (deep link auf /admin/leads?eventId=…)

2) **Statuszeile (unter Zeitraum)**
- Live: `Aktualisiert vor 12s`
- Refresh: `Aktualisiere …`
- Error: `Live-Update fehlgeschlagen` + Button `Erneut versuchen`
- darunter klein/grau: `TraceId: …`

3) **Traffic Chart (Must-have)**
- Leads pro Stunde (ruhiger Linienchart)
- Akzentfarbe für Hauptserie
- optional Vergleich (grau)

4) **Performance pro Gerät**
- Ranking-Liste: Gerät + Leads (optional kleine Zahl “Leads / Std.”)

5) **Interessen / Formularanalyse**
- Top Interessen (Top 8–12)
- optional Top Formulare (Top 5)

6) **Lead-Qualität**
- % mit Visitenkarte
- % mit Notizen
- % qualifiziert
- optional ruhiger Funnel: Erfasst → Mit Visitenkarte → Qualifiziert

### Live Auto-Refresh (MVP Polling)

- Polling Intervall: 30s
- Nur 1 in-flight Request (kein Parallel-Polling)
- Langsame Response → nächster Poll wird übersprungen
- Tab nicht sichtbar → Auto-Pause
- Fehler → Backoff (30s → 60s → 120s max) + Statusanzeige
- Response enthält `generatedAt` + `traceId`
- Keine heavy Client-Aggregation

### States

A) **Kein aktives Event / kein Event ausgewählt**
- Hinweis + CTA “Event auswählen”

B) **Event aktiv, keine Leads**
- ruhiger Null-State (“Noch keine Leads im gewählten Zeitraum.”)

C) **Event läuft**
- volles Performance Center (Live optional)

D) **Event archiviert**
- read-only, Live disabled, Status “Pausiert”

### Datenquellen / Endpoints

- Events für Selector: `GET /api/admin/v1/statistics/events`
- KPI Aggregation: `GET /api/admin/v1/statistics?eventId=...&from=...&to=...`

### Proof (manuell + reproduzierbar)

Manuell UI:
1) /admin/statistik öffnen, Event wählen
2) Toggle Live → Status: “Aktualisiere …” → “Aktualisiert vor 0s”
3) Neue Leads erfassen → nach nächstem Poll aktualisiert Headline/Chart

API Proof:
- 2 Calls → `generatedAt` verändert sich, `x-trace-id` vorhanden

Quality gates:
- npm run typecheck
- npm run lint
- npm run build

---

## /admin/reports/executive — Executive Messebericht (Beta) (TP 8.3 Light)

**Purpose**
Teaser-Screen für einen zukünftigen **Executive Management Report** (Level B Premium).
In der Testphase soll die Testgruppe sofort verstehen: *„Das wird ein Management-Report für unsere Geschäftsleitung.“*

**Leitplanken (verbindlich)**
- Apple-clean, ruhig, Premium-Ankündigung
- Keine AI-Integration, keine PDF-Engine, kein Backend
- Kein Fake “Generieren”
- Keine ausgegrauten Controls
- Genau **1** CTA: Feedback geben

### Struktur (Wireframe)

1) **Hero**
- Titel: Executive Messebericht
- Badge: Beta
- Subline: Management-Report mit Performance-Analyse, Geräte-Ranking und strategischen Empfehlungen

2) **Was Sie erwartet**
Bullets:
- Mehrseitiger PDF-Bericht (2–5 A4 Seiten)
- Executive Summary für Geschäftsleitung
- Leads pro Stunde & Peak-Analyse
- Geräte-Performance-Ranking
- Interessen- & Qualitätsauswertung
- Strategische Empfehlungen für zukünftige Engagements

3) **Testphase Callout**
- Ruhiger Hinweis: Feature in Vorbereitung
- Frage: frühzeitig Zugriff als Testkunde?
- CTA: **Feedback geben** (mailto)

### Proof (manuell)

1) Sidebar → Reports → Executive Messebericht (Beta)
2) Route lädt ohne Fehler: `/admin/reports/executive`
3) CTA öffnet Mail-Client (mailto)

Quality gates:
- npm run typecheck
- npm run lint
- npm run build

---

## Admin Navigation (GoLive) — TP 8.4

**Prinzip:** Kundenzentriert, chronologisch, geschäftsorientiert.  
**Wichtig:** URLs bleiben unverändert (Label-/IA-Refactoring only).

### Hauptnavigation

- **Übersicht**
  - Übersicht

- **Vorbereitung**
  - Vorlagen
  - Formulare
  - Branding

- **Messen**
  - Messen & Events
  - Geräte

- **Leads**
  - Leads
  - Exporte

- **Auswertung**
  - Performance
  - Executive Bericht (Beta)

- **Abrechnung**
  - Lizenzübersicht
  - Firma & Belege

- **Organisation** (sticky)
  - Organisation

### Begrifflichkeit (Alt → Neu)

| Alt | Neu |
|---|---|
| Start | Übersicht |
| Setup | Vorbereitung |
| Einsatz | Messen |
| Events | Messen & Events |
| Performance | Performance |
| Reports | Executive Bericht |
| Lizenzen | Abrechnung |
| Einstellungen | Organisation |

---

## Screen: Organisation (TP 8.5)

### Ziel
Ein zentraler, strategischer Organisationsbereich als strukturelle Basis des Mandanten:
Transparenz, Verantwortlichkeit, Premium SaaS-Wirkung – ohne Overengineering.

### Struktur
- /admin/organisation — Übersicht (Hub)
- /admin/organisation/mandant — Mandant (read-only)
- /admin/organisation/transfer — Mandant übertragen (Beta-Scaffold)

### Navigationsposition
- Hauptnavigation: **Organisation**
- Footer: **nur noch „Abmelden“**
- Keine Utility-Links im Footer (GoLive-clean).

### Abgrenzung zu Abrechnung
- Organisationsdaten sind **read-only** (Mandant, Owner, Aggregation).
- Rechnungsdaten bleiben unter **Abrechnung → Firma & Belege** (keine Doppelung).

### MVP: Single Owner
- Pro Mandant genau eine verantwortliche Person (Tenant Owner).
- Keine Benutzerverwaltung im MVP.

### Transfer (Beta-Scaffold)
- Teaser/Struktur vorhanden, kein echter Flow.
- Copy erklärt: Owner-Übertragung, irreversibel, Rechteübergang.

---

## Screen: Organisation (TP 8.5)

### Ziel
Organisation als zentraler, strategischer Bereich zur Darstellung von Mandantenstruktur und Verantwortlichkeit.
MVP: Single-Tenant-Owner (eine verantwortliche Person pro Mandant). Read-only, keine Edit-Forms.

### Struktur
- **/admin/organisation** — Übersicht (Hub)
- **/admin/organisation/mandant** — Mandant (read-only Details)
- **/admin/organisation/transfer** — Mandant übertragen (Beta-Scaffold)

### Navigationsposition
- **Hauptnavigation:** Organisation
- **Footer:** ausschließlich **Abmelden** (keine Utility-Links)

### Abgrenzung zu Abrechnung
- Organisationsscreen zeigt nur read-only Mandant/Owner + Aggregation (aktive Lizenzen).
- Rechnungs- und Belegdaten bleiben unter **Abrechnung → Firma & Belege** (keine Doppelung).

### Transfer (Beta-Scaffold)
- Kein echter Flow im MVP.
- Sauberer Teaser inkl. Erklärung (irreversibel, Rechteübergang) + CTA „Für Testphase vormerken“.
