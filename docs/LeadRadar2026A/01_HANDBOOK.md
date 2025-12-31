# LeadRadar2026A – Living Handbook

## Projektprinzipien (GoLive-ready)
- Screen-by-screen Entwicklung (DB → API → UI), jeder Schritt getestet.
- Keine Offline-Funktion im Phase-1 Build, aber Architektur vorbereitet (clientLeadId, idempotency).
- Tenant-first, leak-safe Queries, Standard Responses + traceId.
- Masterchat = Steuerung, Teilprojekt-Chats = Umsetzung.

## Konventionen
### API Namespaces
- /api/admin/v1/*
- /api/mobile/v1/*
- /api/platform/v1/*

### Response Shape
- jsonOk/jsonError + x-trace-id (lib/api.ts)

### Validation + Errors
- Zod + lib/http.ts (validateBody/validateQuery)
- konsistente Error Codes (siehe 03_API.md)

### Tenant Scope
- tenantId enforced in jeder tenant-owned Query
- leak-safe: 404 statt “existence leaks”

## Changelog (Entscheidungen)
- YYYY-MM-DD: Entscheidung – Kurztext – Impact
