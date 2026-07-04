# PRD — emergent-v4 (منصة العدالة / Legal Practice Management Platform)

## Original Problem Statement
Import & setup task (June 2026): Clone `https://github.com/secondnumb11-source/emergent-v4.git`, get it fully running as-is in the workspace, no code changes. User supplied a Supabase Management API access token for future use.

## Product
Arabic (RTL) SaaS platform for managing law firms in Saudi Arabia ("منصة العدالة لإدارة مكاتب المحاماة"): Najiz portal integration, AI-powered legal drafting, ZATCA invoicing, WhatsApp notifications, case management.

## Architecture (as imported — do not change routing)
- **Frontend**: TanStack Start + Vite + React 19 + TypeScript + Tailwind v4, port 3000 (`yarn start` → `vite dev --host 0.0.0.0 --port 3000`). Real API handlers live in `/app/frontend/src/routes/api/`.
- **Backend**: `/app/backend/server.py` is a **transparent FastAPI+httpx reverse proxy** forwarding `/api/*` → `http://localhost:3000/api/*` (ingress sends /api to :8001). Do NOT add business logic there.
- **Database**: External **Supabase** (`https://sofurxihjwgmbosyzeib.supabase.co`); hardcoded fallback creds in `src/integrations/supabase/env.ts` (self-contained). Local MongoDB unused by app but MONGO_URL preserved.
- **Node 20 note**: `frontend/.yarnrc` has `ignore-engines true` (some deps declare Node >=22). Always `yarn install --ignore-engines`.
- Extras in repo: `frontend/bot/`, `frontend/extension/`, `frontend/supabase/` (config + migrations), Playwright tests.

## Environment
- `/app/frontend/.env`: REACT_APP_BACKEND_URL (platform, unchanged), VITE_SUPABASE_URL, SUPABASE_ACCESS_TOKEN (user-provided mgmt token `sbp_...b02`, validated 200 against api.supabase.com — for CLI/type-gen/management tasks)
- `/app/backend/.env`: MONGO_URL, DB_NAME, PROXY_TARGET
- .env files are gitignored in repo; recreate on re-import.

## What's Been Done (2026-06, this session)
- Cloned repo (branch: main), imported into /app preserving platform .git/.emergent
- Installed backend (pip) + frontend (yarn --ignore-engines) deps
- Recreated .env files; services RUNNING under supervisor
- Smoke tests passed: `/` 200, `/auth` 200, `/api/public/system-check` 401 (expected — proves proxy chain), landing page screenshot verified (RTL Arabic UI renders correctly)
- Supabase access token validated against Management API (200)

## Test Accounts
- None seeded (external Supabase auth). See frontend/scripts/seed-test-accounts.sh if needed later.

## Backlog / Next
- Awaiting user's first edit instruction (no features requested in this phase)
- Deferred: deeper smoke tests ("later" per user), any Najiz/ZATCA/WhatsApp key configuration if requested
