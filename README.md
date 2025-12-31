# LeadRadar2026A

GoLive-ready rebuild (screen-by-screen, test-driven, documented).

## Local
```bash
npm install
cp .env.example .env.local
# set DATABASE_URL in .env.local

npx prisma generate

npm run typecheck
npm run lint
npm run build

npm run dev
curl -i http://localhost:3000/api/platform/v1/health
curl -i http://localhost:3000/api/admin/v1/health
curl -i http://localhost:3000/api/mobile/v1/health


