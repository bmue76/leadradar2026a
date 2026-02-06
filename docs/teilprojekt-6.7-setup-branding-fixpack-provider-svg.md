# Schlussrapport — Teilprojekt 6.7: Branding → Fixpack (Mobile Provider Wiring + Admin Accent Soft + Safe SVG Logo)

Status: DONE ✅  
Datum: 2026-02-06  
Commit(s):
- `ffd13e2` — feat(tp6.7): mobile branding provider wiring + admin accent soft + safe svg logo support

## Ziel

Ein kleiner Fixpack rund um Branding, damit alles konsistent und “GoLive-stabil” läuft:

- Mobile: Branding Provider korrekt in `_layout.tsx` verdrahten (TS Fehler weg).
- Admin: Accent Tokens sauber setzen (inkl. `--lr-accent-soft` als “soft RGBA”, kein 1:1 Duplicate).
- Admin: Logo Endpoint unterstützt SVG (mit MVP-Safety Hardening).

## Umsetzung

### Mobile: Provider Wiring
- `apps/mobile/app/_layout.tsx`
  - Tabs werden von `BrandingProvider` umschlossen.
  - Korrekte Imports (kein `TenantBrandingProvider`-Phantom mehr).
  - Ergebnis: keine TS/Runtime-Fehler wegen fehlender Provider-Props.

### Admin: Accent Tokens
- `src/app/(admin)/admin/_components/AdminAccentProvider.tsx`
  - `--lr-accent` bleibt HEX.
  - `--lr-accent-soft` wird als `rgba(r,g,b,0.14)` gesetzt (ruhiger, “Apple-clean”).
  - Unnötiger `React`-Import entfernt (keine `no-unused-vars` Warnung).

### Admin: Safe SVG Logo Support
- `src/app/api/admin/v1/tenants/current/logo/route.ts`
  - Erlaubte MIMEs erweitert um `image/svg+xml`.
  - Basic SVG Guardrails: blockiert u.a. `<script>`, `<foreignObject>`, `on*=` Handler, `javascript:` URLs.
  - Response Hardening: `X-Content-Type-Options: nosniff` + SVG-spezifische CSP/Sandbox.
  - Cache/ETag-Verhalten bleibt stabil.

## Akzeptanzkriterien / Tests

- ✅ `npm run typecheck` grün  
- ✅ `npm run lint` grün  
- ✅ `npm run build` grün  
- ✅ Admin Logo Upload: PNG & SVG akzeptiert (max 2 MB)  
- ✅ Admin Logo GET liefert korrekten `Content-Type` und sichere Header  
- ✅ Mobile startet ohne Provider/Import-Fehler; Branding Header bleibt funktionsfähig

## Hinweise

- SVG Safety ist bewusst “MVP-hardening”, kein vollständiger Sanitizer.
- Empfehlung: Für problematische SVGs weiterhin PNG (transparent) nutzen.

## Nächste Schritte

- TP 6.8: Branding “Finish & Polish”
  - Admin UI Feinschliff (Microcopy/States), optional “Logo entfernen” Button.
  - Mobile: Accent Token konsequent auf CTA/Highlights anwenden (nur dort, wo sinnvoll).
  - Doku: API Contract Branding/Logo finalisieren (Header + Cache Regeln).
