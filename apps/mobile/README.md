# LeadRadar Mobile (TP 3.2) — Expo Router (ONLINE-only MVP)

## Requirements
- Node + npm
- Expo CLI (via `npx expo ...`)
- Android Phone (Expo Go or Dev Client)

## ENV
Create `.env.local`:
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.119:3000

shell
Code kopieren

## Run (Expo)
npm install
npx expo start

shell
Code kopieren

## Backend
From repo root:
cd /d/dev/leadradar2026a
npm run dev

bash
Code kopieren

## Provisioning Flow
1) Admin: `http://localhost:3000/admin/settings/mobile` → create Provision Token (QR / Copy).
2) Mobile: `/provision` → scan QR or paste token → Claim → apiKey stored in SecureStore.
3) Mobile: `/forms` loads assigned ACTIVE forms.
4) Tap form → capture → POST lead → proof in `/admin/leads`.

## Phase 1 Note
ONLINE-only. Offline outbox/sync is prepared in `src/lib/offline.ts` but NOT implemented.
