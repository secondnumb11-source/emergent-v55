# plan.md

## 0. Re-Import Status (Current Session)
- Project re-cloned from GitHub: `https://github.com/secondnumb11-source/emergent-v2.git` (COMPLETE).
- Imported into `/app`: frontend (TanStack Start + Vite), backend (FastAPI `/api` proxy), plan.md, memory, tests.
- Previous template backed up to `/app/.template_backup/` (timestamped folders).
- `.env` files recreated (gitignored in repo): platform vars `REACT_APP_BACKEND_URL` and `MONGO_URL` preserved unchanged.
- Supabase config: hardcoded fallbacks in `src/integrations/supabase/env.ts` point to `https://sofurxihjwgmbosyzeib.supabase.co` (self-contained, no env setup needed).
- Dependencies installed: `pip install -r requirements.txt` (backend) and `yarn install --ignore-engines` (frontend; `.yarnrc` has `ignore-engines true` for Node 20).
- Services verified RUNNING under Supervisor: frontend (Vite:3000), backend (proxy:8001), mongodb.
- Smoke checks passed: `/` 200, `/auth` 200, `/api/public/system-check` 401 (expected — proves proxy chain).
- App is ready for user-requested edits with working HMR.

## 1. Objectives
- Keep the imported **launchpad-editor-main** project running reliably under Supervisor in the Emergent runtime.
- Preserve the required platform environment constraints:
  - **Do not modify** `REACT_APP_BACKEND_URL` in `/app/frontend/.env`.
  - **Do not modify** `MONGO_URL` in `/app/backend/.env`.
- Ensure platform routing continues to work:
  - Ingress routes **/api/*** → **backend:8001**, while TanStack Start API routes are served by **frontend:3000**.
  - Backend must remain a **transparent reverse proxy** forwarding `/api/*` → `http://localhost:3000/api/*`.
- Leave the codebase in **/app/frontend** ready for user-requested edits with working Vite HMR.
- Document and maintain the authentication testing posture (external Supabase; no seeded test users yet).

## 2. Implementation Steps

### Phase 1: Import + Run (COMPLETE)
**User stories (Phase 1)**
1. As a user, I want the project extracted into the correct runtime folders so Supervisor can start it without manual steps.
2. As a user, I want the preview URL to load the app UI.
3. As a user, I want `/api/*` routes to work through the platform ingress without changing the frontend routing.
4. As a developer, I want the original template preserved so I can roll back quickly if needed.
5. As a developer, I want env variables merged safely so required platform vars remain unchanged.

**Completed work**
1. **Backup current templates**
   - Backed up to: `/app/.template_backup/frontend` and `/app/.template_backup/backend`.

2. **Move project into `/app/frontend`**
   - Project installed at: `/app/frontend`.
   - Frontend runs via Supervisor `yarn start` and serves Vite on port **3000**.

3. **Merge frontend environment**
   - Kept project Supabase vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, etc.).
   - Preserved platform vars unchanged: `REACT_APP_BACKEND_URL`, `WDS_SOCKET_PORT`, `ENABLE_HEALTH_CHECK`.
   - Backend env preserved; `MONGO_URL` unchanged.

4. **Install dependencies (Node 20 compatibility)**
   - `yarn install` required `--ignore-engines` because `@ai-sdk/openai@4.0.7` declares Node `>=22` but runtime is Node **20.20.2**.
   - Added `/app/frontend/.yarnrc` with `ignore-engines true` to make future installs consistent.

5. **Turn backend into transparent /api reverse proxy**
   - Replaced `/app/backend/server.py` with **FastAPI + httpx** proxy:
     - Forwards all `/api/{path}` to `http://localhost:3000/api/{path}`.
     - Preserves method, querystring, headers (minus hop-by-hop), and body.
   - `httpx==0.28.1` present in `/app/backend/requirements.txt`.

6. **Restart services**
   - Supervisor services running:
     - `frontend` (Vite dev server on **3000**)
     - `backend` (proxy on **8001**)

7. **Smoke verification**
   - Preview URL `/` and `/auth` return HTTP 200.
   - `GET /api/public/system-check` through full chain returns **401 Unauthorized** (expected for this endpoint without a token), proving routing works.


### Phase 2: V1 Validation (end-to-end readiness) (COMPLETE)
**User stories (Phase 2)**
1. As a user, I want the landing route to load reliably on the preview URL.
2. As a user, I want the `/auth` screen to render and allow sign-in attempts.
3. As a developer, I want `/api/*` routes to work identically whether called from browser or server-side.
4. As a developer, I want Supabase connectivity verified so future edits don’t fail silently.

**Completed work (testing_agent report: `/app/test_reports/iteration_1.json`)**
1. **UI render checks**
   - Landing page (Arabic RTL) renders fully; navigation and sections work.
   - `/auth` renders correctly: account type selector (lawyer/client/employee), login/signup tabs, and Google button.

2. **Proxy correctness checks**
   - Verified `GET /api/public/system-check` returns **401 Unauthorized** through ingress → backend:8001 → frontend:3000 (expected behavior; confirms proxy chain works).

3. **Supabase connectivity checks**
   - Invalid login shows proper Arabic error message (confirms live Supabase connectivity).

4. **Known warning (left unchanged)**
   - Cosmetic SSR hydration mismatch warning due to `Math.random()` in hero particle animations.
   - No functional impact; fix priority LOW.


### Phase 3: Future (user-driven edits/features) (PENDING)
**User stories (Phase 3)**
1. As a user, I want requested UX/feature changes implemented without breaking auth.
2. As a user, I want core case/client workflows to remain stable while features evolve.
3. As a developer, I want changes verified with the existing test suite where possible.
4. As a developer, I want Najiz display parsing to remain display-only (no ingestion changes).
5. As a developer, I want each change deployed with quick regression checks.

**Constraints / operational notes for Phase 3**
- **Use yarn** for dependency management. (`.yarnrc` has `ignore-engines true` to avoid Node>=22 engine blocks.)
- Keep `/app/backend/server.py` as a **pure proxy** (no business logic) so the ingress routing continues to work.
- Do **not** change Najiz ingestion/sync DB schema paths when adjusting UI; parsing is display-only in `src/lib/najiz-display.ts`.

**Auth / test credentials status (important for future work)**
- External Supabase (Lovable Cloud project): `https://njoiubmkzhpxmlwxzoec.supabase.co`.
- Repo test creds (`lawyer@test.local` / `Test1234!`) **do not exist** in this Supabase project.
- Public signup works but requires email confirmation.
- We do not currently have `SUPABASE_SERVICE_ROLE_KEY`, so we cannot auto-confirm or seed test users.
- To enable authenticated testing later:
  - Ask the user for `SUPABASE_SERVICE_ROLE_KEY`, then run:
    - `SUPABASE_URL=https://njoiubmkzhpxmlwxzoec.supabase.co SUPABASE_SERVICE_ROLE_KEY=... bash scripts/seed-test-accounts.sh`
  - Or have the user log in with an existing confirmed account.
- Details recorded in `/app/memory/test_credentials.md`.

**Steps (when user provides edit requests)**
1. Collect and clarify the first set of requested edits.
2. Implement changes in small, reviewable increments.
3. Run checks as appropriate:
   - `yarn lint`
   - `yarn typecheck`
   - `yarn test` (unit/regression)
   - `yarn run test:rls` (Playwright, if credentials are available)
4. Validate:
   - Public routes (`/`, `/auth`) still render.
   - `/api/*` still works via ingress (proxy chain intact).
   - No regression in RTL layout or key workflows.

## 3. Next Actions
1. Await the user’s first edit/feature requests for Phase 3.
2. If authenticated testing is needed, request `SUPABASE_SERVICE_ROLE_KEY` (or confirmed user credentials) to seed/verify accounts.
3. Optional (only if user requests): address the low-priority SSR hydration mismatch in the hero particles.

## 4. Success Criteria
- App remains running under Supervisor:
  - Frontend: Vite dev server on **3000**.
  - Backend: FastAPI proxy on **8001**.
- Preview URL loads public pages and `/auth` reliably.
- `/api/*` requests succeed through ingress by reaching the frontend server routes via the backend proxy.
- Protected env lines remain unchanged: `REACT_APP_BACKEND_URL` and `MONGO_URL`.
- Codebase is ready for editing in `/app/frontend` with working HMR.
- Clear path exists to enable authenticated testing once credentials/service role key are provided.