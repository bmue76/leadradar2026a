# LeadRadar2026A — Admin UI

Stand: 2026-02-24  
Scope: Screen-by-screen, GoLive-ready

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
- Active Devices: delegate wird dynamisch über Prisma Client ermittelt (keyword "device"), Aktiv-Fenster 15min
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
