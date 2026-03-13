# Schlussrapport — TP 9.5 Mobile Shell & Navigation Consolidation

**Titel + Status + Datum + Commit(s)**  
Teilprojekt: TP 9.5 — Mobile Shell & Navigation Consolidation  
Status: DONE  
Datum: 2026-03-12 (Europe/Zurich)  
Commit(s): _nach Commit ergänzen_

---

## Ziel

Die Mobile App sollte auf eine ruhige, GoLive-taugliche Hauptnavigation reduziert werden.  
Zielbild war:

- Start
- Leads
- + Lead erfassen
- Performance
- Profil

Systemische Screens wie Provision, Activate, License und Event Gate sollten funktional erhalten bleiben, aber nicht mehr Teil der sichtbaren Hauptnavigation sein.

---

## Umsetzung (Highlights)

- Expo Router Shell / Tabs auf die Zielstruktur konsolidiert:
  - Start
  - Leads
  - Erfassen
  - Performance
  - Profil
- zentralen Plus-Entry als stärkste Aktion im Tab-Bar-Mittelpunkt umgesetzt
- Provision / Activate / License / Event Gate / Forms aus der normalen Tab-Navigation ausgeblendet
- Capture Launcher als sauberen Einstieg vor dem Formular verankert
- Header-Muster der Hauptscreens auf ruhige, linksbündige Content-Header umgestellt
- Tenant-Logo im Header aktiviert
- Accent Color aus Mobile Branding für:
  - aktive Tabs
  - Plus-Button
  - Primary Buttons
  verwendet
- neutrale Typografie / Labels bewusst schwarz bzw. neutral gehalten
- Android Tab-Bar-Höhe / Position korrigiert
- Branding-Handling robuster gemacht:
  - offizieller Tenant-Name aus Mobile Branding
  - Logo via `logo-base64`
  - Accent Color aus Branding-Response

---

## Dateien / Änderungen

### Mobile App
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/app/home.tsx`
- `apps/mobile/app/leads.tsx`
- `apps/mobile/app/capture.tsx`
- `apps/mobile/app/stats.tsx`
- `apps/mobile/app/settings.tsx`
- `apps/mobile/app/forms/index.tsx`
- `apps/mobile/src/features/branding/useBranding.ts`
- `apps/mobile/src/ui/MobileContentHeader.tsx`

### Backend
- `src/app/api/mobile/v1/branding/route.ts`

### Doku
- `docs/teilprojekt-9.5-mobile-shell-navigation-consolidation.md`

---

## Akzeptanzkriterien – Check

- [x] sichtbare Hauptnavigation auf Zielbild reduziert
- [x] Start / Leads / + / Performance / Profil klar erkennbar
- [x] Provision / Activate / License / Event Gate bleiben intakt, aber ausserhalb der Normalnavigation
- [x] Capture-Flow sinnvoll eingeordnet
- [x] bestehende Lead-Capture-Funktion bleibt intakt
- [x] Event-/Form-Sichtbarkeit bleibt intakt
- [x] ruhigere Mobile Shell umgesetzt
- [x] Tenant-Logo im Header integriert
- [x] Accent Color in Primäraktionen / aktiven States integriert
- [x] Android Bottom Tabs korrekt positioniert
- [x] `npm run typecheck` grün
- [x] `npm run lint` grün

---

## Tests / Proof (reproduzierbar)

### Quality Gate
```bash
cd /d/dev/leadradar2026a
npm run typecheck
npm run lint

cd /d/dev/leadradar2026a/apps/mobile
npm run lint
App Smoke
cd /d/dev/leadradar2026a/apps/mobile
npx expo start --dev-client -c
Manueller Smoke

App startet stabil

Tabs sichtbar: Start / Leads / Erfassen / Performance / Profil

Provision / Activate / License / Event Gate nicht in sichtbarer Hauptnavigation

Plus-Button führt in Capture Launcher

Forms / Event Gate bleiben funktional erreichbar

Tenant-Logo im Header sichtbar

Header-Muster linksbündig und ruhiger

Accent Color auf Primäraktionen / aktiven Tabs sichtbar

Android Bottom Tabs korrekt über Systembereich

Offene Punkte / Risiken
P1

Profil verwendet aktuell weiterhin das technische Feld Konto-Kürzel; für GoLive später allenfalls stärker als Nutzer-/Support-Sicht statt als Setup-Sicht formulieren

Screen-Polish zwischen Start / Leads / Performance / Profil kann in einem Folgeprojekt noch weiter harmonisiert werden

Eventname ist aktuell Demo-Daten-abhängig (Demo Messe) und kein UI-Problem

P1

Accent Color wirkt jetzt korrekt auf Primäraktionen; weitere Feinanwendung nur gezielt, nicht flächig

Next Step

TP 9.6 — Mobile Capture Attachments & Voice Message

Geplante Schwerpunkte:

Voice Message im Capture

zusätzliche Anhänge im Formular

UX / Proof im bestehenden Capture-Flow

keine Offline-/Sync-Implementierung in diesem Schritt
