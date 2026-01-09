# Teilprojekt 3.2 — Mobile App (Expo Router) — PAUSED

Status: PAUSED ⏸️  
Datum: 2026-01-09  
Scope: ONLINE-only (MVP), Expo Go als Dev-Runner

## Warum pausiert?
- Auf Android + Expo Go gab es Netzwerkprobleme (HTTP/Cleartext vs. fetch), wodurch lokale API Calls nicht stabil liefen.
- Workaround via HTTPS Tunnel (cloudflared) funktioniert, ist aber für den aktuellen Projektstand zu komplex/“terminal-heavy”.
- Entscheidung: Mobile erst weiterziehen, wenn restliches System stabiler/“fertiger” ist oder wir gezielt auf Dev Client/EAS wechseln.

## Aktueller Arbeitsstand
- Expo Router Scaffold + erste Screens/Libs wurden begonnen.
- Stand ist lokal geparkt (entweder via git stash oder Branch).

## Wie später wieder aufnehmen?
Option 1 (Expo Go + Tunnel, minimal):
- Backend: npm run dev
- Mobile: Script Proxy+Tunnel+Expo (wenn gewünscht)

Option 2 (clean, empfohlen später):
- Dev Client / EAS Build einführen, damit lokale http://LAN-IP:3000 Calls direkt funktionieren.

