# LeadRadar Admin — UX Spec (Apple-clean, Design System light)

Stand: 2026-01-06 (TP 2.2)

## Prinzipien

- **Weißraum statt Linien.**
- **Typografie statt Boxen.**
- Pro Screen **genau 1 Primary Action** (LeadRadar rot).
- Keine Card-Schatten, keine Gridlines, kein „Admin-Grau“ als Grundfläche.
- Icons: **monochrom**, keine farbigen Action-Icons.

## Tokens (Quelle)

- `src/app/(admin)/admin/_styles/tokens.css`

## Tables (Finder-like)

- Keine Rahmen, keine Gridlines.
- **Row Hover** als dezente Background-Fläche.
- Actions sind **hidden by default** und erscheinen **nur bei Hover / Focus-within**.
- Status als **ruhiger Chip** (keine Ampel-Farben).

Komponente: `src/app/(admin)/admin/_ui/Table.tsx`

## Actions

- Actions als **Ghost** (text-only, ruhig).
- Keine farbigen Buttons außer Primary CTA.
- Destructive Actions: weiterhin ruhig, keine rote Action-Fläche.

Komponente: `src/app/(admin)/admin/_ui/Button.tsx` (variant: `ghost|secondary|primary`)

## Empty States (Pflicht)

Jeder Screen hat:
- 1 monochromes Icon
- 1 Satz, sachlich
- 1 CTA (Primary)

Komponente: `src/app/(admin)/admin/_ui/EmptyState.tsx`

## Microcopy

- Sachlich, ruhig, konkret.
- Keine Marketing-Sprache.
- Fehler:
  - Titel: “Couldn’t load …”
  - Optional Message
  - **Trace sichtbar**: `Trace: <traceId>`
  - CTA: “Retry”
