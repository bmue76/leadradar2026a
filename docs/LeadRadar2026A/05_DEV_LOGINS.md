# Dev Logins (Atlex & Demo) — stabilisiert ✅

Stand: 2026-01-13

## Ziel
Dev-Start darf nicht mehr durch fehlende/inkonsistente Logins blockiert werden.
Wir wollen **reproduzierbar** in < 1 Minute arbeitsfähig sein.

## Bekannte Dev-Zugangsdaten

### Atlex
- Email: admin@atlex.ch
- Passwort: Admin1234!

### Demo
- Email: admin@leadradar.local
- Passwort: ChangeMe123!

> Hinweis: Diese Credentials sind nur für LOCAL/DEV gedacht.

## Smoke-Test (immer als erstes; 10 Sekunden)
### Variante A: via npm script
```bash
npm run auth:smoke
Variante B: via curl
bash
Code kopieren
curl -s -i \
  -H "content-type: application/json" \
  -H "x-debug-auth: 1" \
  -d '{"email":"admin@atlex.ch","password":"Admin1234!"}' \
  http://localhost:3000/api/auth/login

curl -s -i \
  -H "content-type: application/json" \
  -H "x-debug-auth: 1" \
  -d '{"email":"admin@leadradar.local","password":"ChangeMe123!"}' \
  http://localhost:3000/api/auth/login
Erwartetes Resultat
HTTP 200 OK

Response: {"ok":true,...}

Set-Cookie: lr_session=...

Troubleshooting
NO_PASSWORD_HASH
User existiert, aber passwordHash fehlt → Seed/Bootstrap muss den Hash setzen.

Keine manuellen DB-OPs mehr: Fix im Seed/Bootstrap nachziehen.

NO_USER
Tenant/User fehlt → Seed/Bootstrap erneut laufen lassen.

Guardrails
Keine DEV-only Bootstrap-Endpoints in Prod deployen.

Login-Setup muss idempotent sein (mehrmals ausführen darf nie kaputt machen).
