# LeadRadar2026A – Runbook (Local/Deploy)

## Local Setup (Windows/Git Bash)
- Node LTS
- PostgreSQL local oder Cloud Dev DB
- .env.local (nicht committen)

## Scripts (Baseline)
- npm run dev
- npm run build
- npm run typecheck
- npm run lint

## Secrets Handling (WICHTIG)
- Echte Secrets niemals im Repo.
- Ablage in Passwortmanager (1Password/Bitwarden) oder Vercel Environment.
- Optional: docs/LeadRadar2026A/_private/SECRETS_PRIVATE.md (gitignored)
